# Containerized icon build
#
# Build the image from project root:
# podman build -t build-icons -f Docker/build-icons.Dockerfile .
#
# Run the build and deliver results to src/assets/icons:
# mkdir -p ./src/assets/icons
# podman run --rm -v ./src/assets/icons:/app/icons build-icons
#   Additional build options (before the `build-icons` image tag):
#   -e DEBUG=1  # show build-icons.sh commands and other debug info
#   -e VERBOSE=1  # show verbose `make icons` build output
#   To pick up local changes for development builds, mount (read-only):
#   -v ./puzzles:/app/puzzles:ro
#   -v ./Docker/build-icons.sh:/app/build-icons.sh:ro

FROM alpine:3.21

# Requirements for configuring the build (coreutils is for nproc):
RUN apk add --no-cache cmake make coreutils pkgconfig
# Requirements for building the puzzle apps:
RUN apk add --no-cache build-base gtk+3.0-dev
# Requirements for running the built puzzle apps and processing screenshots:
RUN apk add --no-cache font-noto imagemagick perl

WORKDIR /app

COPY ./puzzles /app/puzzles
COPY ./Docker/build-icons.sh /app/build-icons.sh

CMD ["/bin/sh", "/app/build-icons.sh"]
