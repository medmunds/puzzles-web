#!/bin/bash
# This script runs inside the build-emcc container.
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
# GENERATE_SOURCE_MAPS: set to "ON" to generate source maps
# (will disable several optimizations)
GENERATE_SOURCE_MAPS=${GENERATE_SOURCE_MAPS:-}
# JOBS: number of parallel builds to run, default is number of processors
JOBS=${JOBS:-$(nproc 2>/dev/null || echo 1)}


# --- Directories ---
# Puzzles source code (directory containing CMakeFiles.txt):
SRC_DIR=/app/puzzles
# Generated build files:
BUILD_DIR=/app/build
# Deliverables output:
DIST_DIR_HELP=/app/public/help
DIST_DIR_WASM=/app/assets/puzzles

if [ ! -d "${SRC_DIR}" ]; then
  echo "Puzzles source must be mounted on /app/puzzles (can be read-only)"
  exit 2
fi


# --- Build process ---
echo "[INFO] Building wasm puzzles and docs..."
BINARY_VERSION="1,${BUILDDATE:0:4},${BUILDDATE:4:2},${BUILDDATE:6:2}"
VERSION="${BUILDDATE}.${VCSID}"
VER="Version ${VERSION}"

CMAKE_ARGS=(
  -B "${BUILD_DIR}"
  -S "${SRC_DIR}"
  -DCMAKE_BUILD_TYPE="${BUILDTYPE}"
  -DWEB_APP=true
  -DCMAKE_C_FLAGS="-DVER='\"${VER}\"' -DVERSIONINFO_BINARY_VERSION='${BINARY_VERSION}'"
  -DPUZZLES_ENABLE_UNFINISHED="${BUILD_UNFINISHED}"
)

if [[ "${GENERATE_SOURCE_MAPS}" == "ON" ]]; then
  CMAKE_ARGS+=(-DGENERATE_SOURCE_MAPS=ON)
  echo "[INFO] Source maps will be generated for license extraction"
fi

emcmake cmake "${CMAKE_ARGS[@]}"
(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" VERBOSE="${VERBOSE:-}"
)

# Extract source file list from source maps if they were generated
if ls "${BUILD_DIR}"/*.map 1> /dev/null 2>&1; then
  echo "[INFO] Extracting source file list from source maps..."
  jq -r '.sources[]' "${BUILD_DIR}"/*.map \
    | sed -E -e 's=^(\.\./)+=/=' \
             -e's=^/emsdk/(emscripten|lib)=/emsdk/upstream/\1=' \
    | grep -v "/puzzles" \
    | sort -u \
    > "${BUILD_DIR}/source-file-list.txt"
fi

if [[ -f "${BUILD_DIR}/source-file-list.txt" ]]; then
  echo "[INFO] Generating dependencies.json"
  python3 "${SRC_DIR}/emcc-dependency-info.py" \
    --sources "${BUILD_DIR}/source-file-list.txt" \
    --output "${BUILD_DIR}/dependencies.json"
fi

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

# Public deliverables
mkdir -p "${DIST_DIR_HELP}"
rm -rf "${DIST_DIR_HELP}"/*
cp "${BUILD_DIR}"/help/en/*.html "${DIST_DIR_HELP}" || echo "[WARN] No HTML docs files found."
for file in "${SRC_DIR}"/html/*.html; do
  puzzle=$(basename "$file" .html)
  overview="${DIST_DIR_HELP}/${puzzle}-overview.html"
  # Omit the first line (it's the puzzle name)
  tail -n +2 "$file" > "${overview}"
  # Add a link to the manual
  echo "<p><a href=\"${puzzle}.html#${puzzle}\">Full instructions</a></p>" >> "${overview}"
done

# Assets deliverables
mkdir -p "${DIST_DIR_WASM}"
rm -rf "${DIST_DIR_WASM}"/*
# The emcc runtime wrapper is the same for all puzzles (differing only in the name
# of the imported wasm file). Pick an arbitrary one to use as a shared runtime.
# (See loadPuzzleModule() in src/puzzle.)
cp "${BUILD_DIR}"/nullgame.js "${DIST_DIR_WASM}/emcc-runtime.js" \
  || echo "[WARN] nullgame.js not found in puzzles/build-webapp."
# Clean up EmbindString in emit-tsd output. (Yes, any embind-wrapped function that
# accepts a string can also take an ArrayBuffer, etc., but return values and
# value object fields are always standard JS strings.)
sed -e '/type EmbindString/d' -e 's/EmbindString/string/g' \
  "${BUILD_DIR}"/nullgame.d.ts > "${DIST_DIR_WASM}/emcc-runtime.d.ts" \
  || echo "[WARN] nullgame.d.ts found in puzzles/build-webapp."

# Then deliver all of the puzzle-specific wasm files (and related sourcemaps).
shopt -s nullglob  # (release builds don't generate .map files)
cp "${BUILD_DIR}"/*.{wasm,map} "${DIST_DIR_WASM}/" \
  || echo "[WARN] No .wasm files found in puzzles/build-webapp."
if [[ -d "${BUILD_DIR}/unfinished" ]]; then
  cp "${BUILD_DIR}"/unfinished/*.{wasm,map} "${DIST_DIR_WASM}/" \
    || echo "[WARN] No unfinished .wasm files found."
fi
shopt -u nullglob

cp "${BUILD_DIR}/catalog.json" "${DIST_DIR_WASM}/" || echo "[WARN] No catalog.json found."
if [[ -f "${BUILD_DIR}/source-file-list.txt" ]]; then
  cp "${BUILD_DIR}/source-file-list.txt" "${DIST_DIR_WASM}/"
fi
if [[ -f "${BUILD_DIR}/dependencies.json" ]]; then
  cp "${BUILD_DIR}/dependencies.json" "${DIST_DIR_WASM}/"
fi
