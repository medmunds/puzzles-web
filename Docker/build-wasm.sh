#!/bin/bash
# This script runs inside the build-wasm container.
# The puzzles directory is expected to be at /app/puzzles.
set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi


# --- Environment configuration options ---
# VCSID: revision identifier -- e.g., "$(git rev-parse --short HEAD)"
VCSID=${VCSID:-unknown}
# BUILDDATE: YYYYMMDD
BUILDDATE=${BUILDDATE:-$(date +%Y%m%d)}
BUILDTYPE=${BUILDTYPE:-Release}
# BUILD_UNFINISHED: semicolon-separated list of unfinished puzzles to also build
#   -- e.g., BUILD_UNFINISHED="group;sokoban"
BUILD_UNFINISHED=${BUILD_UNFINISHED:-}
# JOBS: number of parallel builds to run, default is number of processors
JOBS=${JOBS:-$(nproc 2>/dev/null || echo 1)}


# --- Directories ---
# Puzzles source code (directory containing CMakeFiles.txt):
SRC_DIR=/app/puzzles
# Generated build files:
BUILD_DIR=/app/build-wasm
# Deliverables output:
DIST_DIR=/app/wasm


# --- Build process ---
echo "[INFO] Building Wasm puzzles and docs..."
BINARY_VERSION="1,${BUILDDATE:0:4},${BUILDDATE:4:2},${BUILDDATE:6:2}"
VERSION="${BUILDDATE}.${VCSID}"
VER="Version ${VERSION}"
emcmake cmake -B "${BUILD_DIR}" -S "${SRC_DIR}" \
  -DCMAKE_BUILD_TYPE="${BUILDTYPE}" \
  -DWEB_APP=true \
  -DCMAKE_C_FLAGS="-DVER='\"${VER}\"' -DVERSIONINFO_BINARY_VERSION='${BINARY_VERSION}'" \
  -DPUZZLES_ENABLE_UNFINISHED="${BUILD_UNFINISHED}"

(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" VERBOSE="${VERBOSE:-}"
)

echo "[INFO] Building catalog.json..."
jq --arg version "$VERSION" -R -s '
  split("\n") | map(select(length > 0) | split(":") | {
    id: .[0],
    name: .[2],
    description: .[3],
    objective: .[4],
    unfinished: (.[1] == "unfinished")
  }) | map({(.id): ({
    name: .name,
    description: .description,
    objective: .objective,
    unfinished: .unfinished
  } | if .unfinished then . else del(.unfinished) end)
  }) | add | {
    puzzles: .,
    version: $version
  }
' "${BUILD_DIR}/gamedesc.txt" > "${BUILD_DIR}/catalog.json"


# --- Deliverables ---
echo "[INFO] Delivering..."
# Build output is delivered to /app/wasm.
# (This can be a mount into the host's source code.)
mkdir -p "${DIST_DIR}"
rm -rf "${DIST_DIR}"/*

# HTML Docs
mkdir -p "${DIST_DIR}/help"
cp "${BUILD_DIR}"/help/en/*.html "${DIST_DIR}/help/" || echo "[WARN] No HTML docs files found."
for file in "${SRC_DIR}"/html/*.html; do
  puzzle=$(basename "$file" .html)
  snippet="${DIST_DIR}/help/${puzzle}-snippet.html"
  # Omit the first line (it's the puzzle name)
  tail -n +2 "$file" > "${snippet}"
  # Add a link to the manual
  echo "<p><a href=\"${puzzle}.html#${puzzle}\">Full instructions</a></p>" >> "${snippet}"
done

# JavaScript related deliverables
mkdir -p "${DIST_DIR}/js"
# The emcc runtime wrapper is the same for all puzzles (differing only in the name
# of the imported wasm file). Pick an arbitrary one to use as a shared runtime.
# (See loadPuzzleModule() in src/puzzle.)
cp "${BUILD_DIR}"/nullgame.js "${DIST_DIR}/js/emcc-runtime.js" || echo "[WARN] nullgame.js not found in puzzles/build-webapp."
# Clean up EmbindString in emit-tsd output. (Yes, any embind-wrapped function that
# accepts a string can also take an ArrayBuffer, etc., but return values and
# value object fields are always standard JS strings.)
sed -e '/type EmbindString/d' -e 's/EmbindString/string/g' "${BUILD_DIR}"/nullgame.d.ts > "${DIST_DIR}/js/emcc-runtime.d.ts" || echo "[WARN] nullgame.d.ts found in puzzles/build-webapp."

# Then deliver all of the puzzle-specific wasm files (and related sourcemaps).
shopt -s nullglob  # (release builds don't generate .map files)
cp "${BUILD_DIR}"/*.{wasm,map} "${DIST_DIR}/js/" || echo "[WARN] No .wasm files found in puzzles/build-webapp."
if [[ -d "${BUILD_DIR}/unfinished" ]]; then
  cp "${BUILD_DIR}"/unfinished/*.{wasm,map} "${DIST_DIR}/js/" || echo "[WARN] No unfinished .wasm files found."
fi
shopt -u nullglob

cp "${BUILD_DIR}/catalog.json" "${DIST_DIR}/" || echo "[WARN] No catalog.json found."
