@echo off

mkdir build\emmalloc
call emcc emmalloc\test.c -sMALLOC=none -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -o build\emmalloc\emmalloc.js -MJ build\compile_commands.json
copy emmalloc\*.html build\emmalloc\
copy emmalloc\*.js build\emmalloc\
copy emmalloc\*.css build\emmalloc\
copy common\* build\emmalloc\
