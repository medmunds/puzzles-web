# Build JS versions of the puzzles for the web platform.
# This is adapted from:
# - emscripten.cmake, removing the KaiOS-specific parts
# - the portion of windows.cmake that generates gamedesc.txt

enable_language(CXX)

# (Can't include webapp.cpp in platform_common_sources -- see note below.)
set(platform_common_sources)
set(platform_gui_libs)
set(platform_libs embind)
set(CMAKE_EXECUTABLE_SUFFIX ".js")

set(WASM ON
        CACHE BOOL "Compile to WebAssembly rather than plain JavaScript")

find_program(HALIBUT halibut)
if(NOT HALIBUT)
    message(WARNING "HTML documentation cannot be built (did not find halibut)")
endif()
set(HALIBUT_OPTIONS
        "-Chtml-template-fragment:%k"
        "-Chtml-chapter-shownumber:false"
        "-Chtml-section-shownumber:0:false"
)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -DSTYLUS_BASED -DNARROW_BORDERS")

# -lexports.js prevents wasmImports name minification, which allows reusing
# a single emcc runtime wrapper for all <puzzle>.wasm. (The linker doesn't
# seem to mind that exports.js doesn't exist.)
# (See https://github.com/emscripten-core/emscripten/issues/16695.)
set(CMAKE_CXX_LINK_FLAGS "${CMAKE_CXX_LINK_FLAGS} \
--no-entry \
-lexports.js \
-sALLOW_MEMORY_GROWTH=1 \
-sALLOW_TABLE_GROWTH=1 \
-sENVIRONMENT=web,worker \
-sEXPORT_BINDINGS=1 \
-sEXPORT_ES6=1 \
-sMODULARIZE=1 \
-sWASM=1 \
-sWASM_BIGINT \
")

set(build_cli_programs FALSE)
set(build_gui_programs FALSE)

function(get_platform_puzzle_extra_source_files OUTVAR NAME AUXILIARY)
    # webapp.cpp is here, rather than platform_common_sources,
    # because the common sources end up in libcore, and EMSCRIPTEN_BINDINGS
    # are lost from libraries without a bunch of extra work.
    set(${OUTVAR} "${CMAKE_SOURCE_DIR}/webapp.cpp" PARENT_SCOPE)
endfunction()

function(set_platform_gui_target_properties TARGET)
endfunction()

function(set_platform_puzzle_target_properties NAME TARGET)
    # Always build with source maps to allow extracting dependency licenses.
    # As of emsdk 4.0.15, -gsource-map alone does not disable optimizations,
    # so does not (significantly) increase the size of the generated wasm.
    target_compile_options(${TARGET} PRIVATE
        -gsource-map
    )
    target_link_options(${TARGET} PRIVATE
        # Generate TypeScript .d.ts files for emcc exports
        "--emit-tsd" "${NAME}.d.ts"
        # Generate DWARF source maps for Debug builds
        $<$<CONFIG:Debug>:-gseparate-dwarf>
        $<$<CONFIG:Debug>:-gsource-map=inline>
        -gsource-map
    )
endfunction()

function(build_platform_extras)
    if(HALIBUT)
        set(help_dir ${CMAKE_CURRENT_BINARY_DIR}/help)
        add_custom_command(OUTPUT ${help_dir}/en
                COMMAND ${CMAKE_COMMAND} -E make_directory ${help_dir}/en)
        add_custom_command(OUTPUT ${help_dir}/en/index.html
                COMMAND ${HALIBUT} --html ${HALIBUT_OPTIONS}
                ${CMAKE_CURRENT_SOURCE_DIR}/puzzles.but
                # Skip hardcoded, possibly outdated additional licenses in emcccopy.but.
                # We extract required notices using in emcc-dependency-info.py.
                # ${CMAKE_CURRENT_SOURCE_DIR}/emcccopy.but
                DEPENDS
                ${help_dir}/en
                ${CMAKE_CURRENT_SOURCE_DIR}/puzzles.but
                ${CMAKE_CURRENT_SOURCE_DIR}/emcccopy.but
                WORKING_DIRECTORY ${help_dir}/en)
        add_custom_target(doc ALL
                DEPENDS ${help_dir}/en/index.html)
    endif()

    # Generate gamedesc.txt -- adapted from windows.cmake.
    file(WRITE ${CMAKE_CURRENT_BINARY_DIR}/gamedesc.txt "")
    list(SORT puzzle_names)
    foreach(name ${puzzle_names})
        list(FIND PUZZLES_ENABLE_UNFINISHED ${name} unfinished_pos)
        if (unfinished_pos GREATER -1)
            set(unfinished "unfinished")
        else()
            set(unfinished "")
        endif()
        file(APPEND ${CMAKE_CURRENT_BINARY_DIR}/gamedesc.txt "\
${name}:\
${unfinished}:\
${displayname_${name}}:\
${description_${name}}:\
${objective_${name}}\n")
    endforeach()
endfunction()
