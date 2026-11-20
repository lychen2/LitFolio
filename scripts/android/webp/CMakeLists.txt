cmake_minimum_required(VERSION 3.16)
project(LitFolioPillowWebP LANGUAGES C)

set(BUILD_SHARED_LIBS OFF)
foreach(tool ANIM_UTILS CWEBP DWEBP GIF2WEBP IMG2WEBP VWEBP WEBPINFO WEBPMUX EXTRAS)
    set(WEBP_BUILD_${tool} OFF CACHE BOOL "" FORCE)
endforeach()
add_subdirectory("${WEBP_SOURCE}" libwebp EXCLUDE_FROM_ALL)

add_library(_webp MODULE "${PILLOW_SOURCE}/src/_webp.c")
target_include_directories(_webp PRIVATE "${PYTHON_TARGET}/include/python3.11")
target_link_libraries(_webp PRIVATE
    "${PYTHON_TARGET}/jniLibs/${ANDROID_ABI}/libpython3.11.so"
    libwebpmux webpdemux webp)
set_target_properties(_webp PROPERTIES PREFIX "")
target_link_options(_webp PRIVATE -Wl,--exclude-libs,ALL -Wl,--no-undefined -Wl,--strip-debug)
