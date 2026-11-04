@echo off
cd /d "%~dp0"
if not exist out\main\index.js call npm run build
start "" node_modules\electron\dist\electron.exe .
