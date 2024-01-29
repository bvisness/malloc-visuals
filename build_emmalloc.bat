@echo off

mkdir build\emmalloc
call emcc emmalloc\test.c -sMALLOC=none -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,malloc -o build\emmalloc\emmalloc.js -MJ build\compile_commands.json
copy emmalloc\index.html build\emmalloc\index.html
copy emmalloc\struct.js build\emmalloc\struct.js
copy emmalloc\index.js build\emmalloc\index.js
