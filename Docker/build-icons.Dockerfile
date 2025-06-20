# Containerized icon build
#
# Build the image from project root:
# podman build -t build-icons -f Docker/build-icons.Dockerfile .
#
# Run the build and deliver results to src/assets/icons/:
# podman run --rm \
#   -v ./puzzles:/app/puzzles:ro \
#   -v ./Docker/build-icons.sh:/app/build-icons.sh:ro \
#   -v ./src/assets:/app/assets \
#   build-icons
# Mounting build-icons.sh is optional; use if the script has changed since the image was built.
# Additional build options (via build-icons.sh env variables):
#   -e DEBUG=1  # show build-icons.sh commands and other debug info
#   -e VERBOSE=1  # show verbose make build output
#   -e JOBS=1  # run make single-threaded (default nprocs, comingles output)

FROM alpine:3.22

# Requirements for configuring the build (coreutils is for nproc):
RUN apk add --no-cache cmake make coreutils pkgconfig
# Requirements for building the puzzle apps:
RUN apk add --no-cache build-base gtk+3.0-dev
# Requirements for running the built puzzle apps and processing screenshots:
RUN apk add --no-cache font-noto imagemagick perl
# Requirements for optimizing generated icons:
RUN apk add --no-cache oxipng

WORKDIR /app

COPY ./Docker/build-icons.sh /app/build-icons.sh

CMD ["/bin/sh", "/app/build-icons.sh"]
