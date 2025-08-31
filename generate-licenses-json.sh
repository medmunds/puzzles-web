#!/usr/bin/env sh
set -eu

# Extract license information from package.json production dependencies
# in a form that can be displayed in the about-dialog.
#
# The script writes a json file to the --out FILE arg (default stdout)
# in the form:
# {
#   "licenses": [
#     {
#       "name": "package.json:name",
#       "licenseType": "package.json:license",
#       "licenseText": <see below>
#     },
#     ...
#   ]
# }
#
# The name and licenseType fields are extracted from the installed
# node_modules/<package>/package.json.
#
# If there is an installed node_modules/<package>/LICENSE (or LICENSE.txt
# or LICENSE.md), its contents are provided in the licenseText field.
# If no LICENSE file was installed with the package, the licenseText field
# is omitted for now. (We may try to obtain it from the package repo later.)
#
# The script considers only top-level dependencies in the current package.json
# (not recursive, and not devDependencies or other types). It assumes that
# dependencies have been installed to node_modules before it is run.

# Command-line arguments:
#   --out FILE  Write JSON output to FILE instead of stdout
out_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      if [ $# -lt 2 ]; then
        echo "Error: --out requires a FILE argument" >&2
        exit 2
      fi
      out_file="$2"
      shift 2
      ;;
    --out=*)
      out_file="${1#--out=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--out FILE]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--out FILE]" >&2
      exit 2
      ;;
  esac
done


# Ensure jq is available
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not found in PATH." >&2
  exit 1
fi

# Ensure package.json exists
if [ ! -f package.json ]; then
  echo "Error: package.json not found in current directory." >&2
  exit 1
fi

# Collect JSON objects for each dependency into a stream (one per line),
# then assemble into the final structure using `jq -s`.
dep_json_stream() {
  # Extract only top-level production dependencies (keys of .dependencies)
  # Note: jq's keys[] returns dependency names; if none, nothing is emitted.
  jq -r '.dependencies? // {} | keys[]' package.json | while IFS= read -r dep; do
    pkg_dir="node_modules/$dep"
    pkg_json="$pkg_dir/package.json"

    if [ ! -f "$pkg_json" ]; then
      echo "Warning: Skipping '$dep' (missing $pkg_json). Did you run npm install?" >&2
      continue
    fi

    # Extract package name and normalize license field
    # Handle forms:
    # - "license": "MIT"
    # - "license": { "type": "MIT" } or { "spdx": "MIT" } or { "name": "MIT" }
    # - "licenses": [{ "type": "MIT" }, { "type": "Apache-2.0" }]
    name="$(jq -r '.name // ""' "$pkg_json")"
    licenseType="$(
      jq -r '
        def norm($p):
          if ($p|type) == "string" then
            $p
          elif ($p|type) == "object" then
            ($p.type // $p.spdx // $p.name // "")
          elif ($p|type) == "array" then
            ( [ $p[] | ( .type // .spdx // .name // . ) ] | join(" OR ") )
          else
            ""
          end;
        if has("license") then
          norm(.license)
        elif has("licenses") then
          norm(.licenses)
        else
          ""
        end
      ' "$pkg_json"
    )"


    # Find a license text file if present in installed node_modules.
    # Try common basenames with common extensions (first match wins).
    license_file=""
    for base in NOTICE LICENSE license COPYING; do
      for ext in "" ".txt" ".md"; do
        file="${base}${ext}"
        if [ -f "$pkg_dir/$file" ]; then
          license_file="$pkg_dir/$file"
          break 2
        fi
      done
    done

    license_text_raw=""
    if [ -n "$license_file" ]; then
      # Read the bundled license file
      license_text_raw="$(cat "$license_file")"

      # Sigh: Comlink copied the entire Apache License into their LICENSE file
      # (including the APPENDIX that explains how to add just the required notice).
      case "$license_text_raw" in
        *"APPENDIX: How to apply"*)
          # Strip out everything before the required notice, which begins with
          # a line that starts "Copyright" (after indentation):
          license_text_raw="$(printf %s "$license_text_raw" | sed -n '/^ *Copyright/,$p')"
        ;;
      esac

    else
      # Try to obtain the license text from a GitHub repo.
      # (This is currently only necessary for webawesome. We *only* try LICENSE.md for this case.)
      # E.g., given repository.url "git+https://github.com/shoelace-style/webawesome.git"
      # and version "3.0.0-beta.4" try to retrieve:
      # https://raw.githubusercontent.com/shoelace-style/webawesome/refs/tags/v3.0.0-beta.4/LICENSE.md
      repo_url="$(jq -r '
        .repository as $r
        | if ($r|type) == "string" then $r
          elif ($r|type) == "object" then ($r.url // "")
          else "" end
      ' "$pkg_json")"
      version="$(jq -r '.version // ""' "$pkg_json")"

      if [ -n "$repo_url" ] && [ -n "$version" ]; then
        # Extract "user/repo" from common GitHub URL forms:
        # - https://github.com/user/repo(.git)
        # - git+https://github.com/user/repo(.git)
        # - git@github.com:user/repo(.git)
        github_repo="$(
          printf %s "$repo_url" | sed -En '
            s#^(git\+)?https?://(www\.)?github\.com[:/]+([^/?]+/[^/?]+)(/.*)?$#\3#p;
            s#^(git@)?github\.com:([^/]+/[^/]+)(/.*)?$#\2#p
          ' | sed -E 's/\.git$//'
        )"
        if [ -n "$github_repo" ]; then
          # Attempt to fetch LICENSE.md from the version tag
          gh_raw_url="https://raw.githubusercontent.com/$github_repo/refs/tags/v$version/LICENSE.md"
          echo "[INFO] Trying to fetch licenseText for $dep from $gh_raw_url" >&2
          license_text_raw="$(curl -fsSL "$gh_raw_url")"
        fi
      fi
    fi

    if [ -n "$license_text_raw" ]; then
      # Build the object with licenseText
      licenseText_json="$(printf %s "$license_text_raw" | jq -Rs .)"
      jq -n \
        --arg name "$name" \
        --arg licenseType "$licenseType" \
        --argjson licenseText "$licenseText_json" \
        '{name:$name, licenseType:$licenseType, licenseText:$licenseText}'
    else
      # Build the object without licenseText
      echo "[WARNING] Couldn't find licenseText for $dep" >&2
      jq -n \
        --arg name "$name" \
        --arg licenseType "$licenseType" \
        '{name:$name, licenseType:$licenseType}'
    fi
  done
}

# Generate final JSON
# Read the stream of per-dependency JSON objects and wrap them
# into { "licenses": [ ... ] }
if [ -n "$out_file" ]; then
  dep_json_stream | jq -s '{licenses: .}' > "$out_file"
else
  dep_json_stream | jq -s '{licenses: .}'
fi
