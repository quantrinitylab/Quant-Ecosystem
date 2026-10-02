cmake_minimum_required(VERSION 3.10)
project(runner LANGUAGES C CXX)

# Set the application target name.
set(BINARY_NAME "quant_tube")

# Set build type defaults.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE "Debug" CACHE
    STRING "Configuration type" FORCE)
  set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
    "Debug" "Profile" "Release")
endif()

# Compilation settings.
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-DAPPLICATION_ID="com.quant.tube")

# Add GTK and Flutter dependencies.
find_package(PkgConfig REQUIRED)
pkg_check_modules(GTK REQUIRED IMPORTED_TARGET gtk+-3.0)
pkg_check_modules(GLIB REQUIRED IMPORTED_TARGET glib-2.0)
pkg_check_modules(GOBJECT REQUIRED IMPORTED_TARGET gobject-2.0)

# Application source files.
add_executable(${BINARY_NAME}
  "runner/main.cc"
  "runner/my_application.cc"
  "flutter/generated_plugin_registrant.cc"
)

# Apply compilation flags and include directories.
target_compile_options(${BINARY_NAME} PRIVATE -Wall -Wextra)
target_include_directories(${BINARY_NAME} PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(${BINARY_NAME} PRIVATE
  PkgConfig::GTK
  PkgConfig::GLIB
  PkgConfig::GOBJECT
  flutter
)

# Generated plugins.
include(flutter/generated_plugins.cmake OPTIONAL)
