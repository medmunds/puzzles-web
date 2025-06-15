#!/bin/bash
# emcmake wrapper installed in build-emcc container, to keep CLion happy.
#
# To set up an Emscripten toolchain and CMake profiles in CLion:
# 1. In Settings > Build, Execution & Deployment > Toolchains:
#    - create a Docker toolchain
#    - set Image to an image built from build-emcc.Dockerfile
#    - change CMake to /app/emcmake-wrapper.sh (this script)
#    - other defaults are fine (and the Debugger "Not specified" error is OK)
# 2. In Settings > Build, Execution & Deployment > CMake:
#    - create a profile (or several)
#    - set Toolchain to the toolchain from step 1
#    - change Generator to "Let CMake Decide"
#    - adjust any other options you want (see the emcmake command in build-emcc.sh)

/emsdk/upstream/emscripten/emcmake /usr/bin/cmake "$@"
