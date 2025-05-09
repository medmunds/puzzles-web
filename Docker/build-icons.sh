#!/bin/sh
# This script runs inside the build-icons container.
# The puzzles directory is expected to be at /app/puzzles.
set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi


# --- Environment configuration options ---
# BUILD_UNFINISHED: semicolon-separated list of unfinished puzzles to also build
#   -- e.g., BUILD_UNFINISHED="group;sokoban"
#   (Note: icon generation doesn't currently consider unfinished puzzles.)
BUILD_UNFINISHED=${BUILD_UNFINISHED:-}
# JOBS: number of parallel builds to run, default is number of processors
JOBS=${JOBS:-$(nproc 2>/dev/null || echo 1)}


# --- Directories ---
# Puzzles source code (directory containing CMakeFiles.txt):
SRC_DIR=/app/puzzles
# Generated build files:
BUILD_DIR=/app/build
# Deliverables output:
DIST_DIR_ICONS=/app/assets/icons

if [ ! -d "${SRC_DIR}" ]; then
  echo "Puzzles source must be mounted on /app/puzzles (can be read-only)"
  exit 2
fi


# --- Build process ---
# Run enough of a native Unix build to produce the various icons.
# (Also checks that the apps compile in 'strict' mode, which is a test of sorts.)
cmake -B "${BUILD_DIR}" -S "${SRC_DIR}" -DSTRICT=ON -DPUZZLES_ENABLE_UNFINISHED="${BUILD_UNFINISHED}"
(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" icons VERBOSE="${VERBOSE:-}"
)

if [ "${DEBUG:-0}" = "2" ]; then
  echo "[DEBUG] Built ${BUILD_DIR}/icons:"
  ls -l "${BUILD_DIR}/icons"
fi

# --- Deliverables ---
mkdir -p "${DIST_DIR_ICONS}"
rm -rf "${DIST_DIR_ICONS}"/*

# The build produces some 32 versions of each puzzle's icons.
# Deliver the ones we're most likely to use:
#   puzzle-base.png: complete screenshot (varying sizes, not always square, 24bit)
#   puzzle-ibase.png: "interesting area" square crop of base (varying sizes, 24bit)
#   puzzle-128d24.png: resized ibase (128x128, 24bit)
#   puzzle-web.png: resized and centered base with excess borders minimized (150x150, 24bit)
#   puzzle-banner.jpg: angled and cropped (240x130, 24bit)
# cp "${BUILD_DIR}"/icons/*-base.png "${DIST_DIR_ICONS}/"
# cp "${BUILD_DIR}"/icons/*-ibase.png "${DIST_DIR_ICONS}/"
#cp "${BUILD_DIR}"/icons/*-64d24.png "${DIST_DIR_ICONS}/"
#cp "${BUILD_DIR}"/icons/*-128d24.png "${DIST_DIR_ICONS}/"
cp "${BUILD_DIR}"/icons/*-64d8.png "${DIST_DIR_ICONS}/"
cp "${BUILD_DIR}"/icons/*-128d8.png "${DIST_DIR_ICONS}/"
# cp "${BUILD_DIR}"/icons/*-web.png "${DIST_DIR_ICONS}/"
# cp "${BUILD_DIR}"/icons/*-banner.jpg "${DIST_DIR_ICONS}/"

# Optimize the delivered icons in place.
oxipng -o max --zopfli --fast -s "${DIST_DIR_ICONS}"/*.png

if [ "${DEBUG:-0}" != "0" ]; then
  echo "[DEBUG] Delivered ${DIST_DIR_ICONS}:"
  ls -l "${DIST_DIR_ICONS}"
fi
