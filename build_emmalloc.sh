#!/bin/bash

mkdir -p build/emmalloc
emcc emmalloc/test.c -sMALLOC=none -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -o build/emmalloc/emmalloc.js -MJ build/compile_commands.json
cp emmalloc/*.html build/emmalloc/
cp emmalloc/*.js build/emmalloc/
cp emmalloc/*.css build/emmalloc/
cp emmalloc/*.svg build/emmalloc/
cp common/* build/emmalloc/
