# Containerized Emscripten builds
#
# Build the image from project root:
# podman build -t build-wasm -f Docker/build-wasm.Dockerfile .
#   Emscripten's official images are amd64. To pull their arm64 variant, add:
#   --build-arg ARCH=arm64
#
# Run the build and deliver results to build/:
# mkdir -p ./build
# podman run --rm -v ./build:/app/wasm -e VCSID="$(git rev-parse --short HEAD)" build-wasm
#   Additional build options (before the `build-wasm` image tag):
#   -e BUILD_UNFINISHED='group;separate;slide;sokoban'  # unfinished puzzles to build (default none)
#   -e DEBUG=1  # show build-wasm.sh commands and other debug info
#   -e VERBOSE=1  # show verbose `make icons` build output
#   To pick up local changes for development builds, mount puzzles (read-only):
#   -v ./puzzles:/app/puzzles:ro
#   -v ./Docker/build-wasm.sh:/app/build-wasm.sh:ro

# Debian-based official Emscripten image includes many build tools.
ARG ARCH=amd64
FROM emscripten/emsdk:4.0.8${ARCH:+-arm64}

# Additional dependencies:
#  - perl for jspage.pl
#  - jq for catalog.json
#  - halibut for help pages (manual)
RUN apt-get update && apt-get install -y \
    perl \
    jq \
    halibut \
    && rm -rf /var/lib/apt/lists/*

# Install tsc for generating .d.ts files from emcc.
# Match the version from package-lock.json.
COPY package-lock.json /app/
RUN TS_VERSION=$(jq -r '.packages."node_modules/typescript".version' /app/package-lock.json) \
    && npm install --no-update-notifier -g "typescript@${TS_VERSION}" \
    && rm -f /app/package-lock.json \
    && tsc --version

WORKDIR /app

COPY ./puzzles /app/puzzles
COPY ./Docker/build-wasm.sh /app/build-wasm.sh
# Add helper for CLion Docker toolchain.
COPY ./Docker/emcmake-wrapper.sh /app/emcmake-wrapper.sh
RUN chmod +x /app/emcmake-wrapper.sh

CMD ["/bin/bash", "/app/build-wasm.sh"]
