# Containerized Emscripten builds
#
# Build the image from project root:
# podman build -t build-emcc -f Docker/build-emcc.Dockerfile .
# (Emscripten's official images are amd64. To use arm64, add `--build-arg ARCH=arm64`.)
#
# Run the build and deliver results to public/help/ and src/assets/js/puzzles/:
# podman run --rm \
#   -v ./puzzles:/app/puzzles:ro \
#   -v ./Docker/build-emcc.sh:/app/build-emcc.sh:ro \
#   -v ./public:/app/public \
#   -v ./src/assets:/app/assets \
#   build-emcc
# Mounting build-emcc.sh is optional; use if the script has changed since the image was built.
# You can skip mounting the public and assets directories if you don't need that output.
# Additional, optional build options (via build-emcc.sh env variables):
#   -e BUILDTYPE='Debug'  # default 'Release'
#   -e BUILD_UNFINISHED='group;slide;sokoban'  # unfinished puzzles to build (default none)
#   -e VCSID="$(git rev-parse --short HEAD)"  # included in help files (default 'unknown')
#   -e DEBUG=1  # show build-emcc.sh commands and other debug info
#   -e VERBOSE=1  # show verbose make output
#   -e JOBS=1  # run make single-threaded (default nprocs, comingles output)

# Debian-based official Emscripten image includes many build tools.
# (Add -${ARCH} suffix when ARCH is set; leave ARCH unset for default amd64.)
ARG ARCH
FROM emscripten/emsdk:4.0.20${ARCH:+-${ARCH}}


# Additional dependencies:
#  - jq for catalog.json
#  - halibut for help pages (instruction manual)
RUN apt-get update && apt-get install -y \
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

COPY ./Docker/build-emcc.sh /app/build-emcc.sh

# Add helper for CLion Docker toolchain.
COPY ./Docker/emcmake-wrapper.sh /app/emcmake-wrapper.sh
RUN chmod +x /app/emcmake-wrapper.sh

CMD ["/bin/bash", "/app/build-emcc.sh"]
