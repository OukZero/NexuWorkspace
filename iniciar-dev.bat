@echo off
rem Modo en vivo: los cambios al codigo se ven solos mientras la app esta abierta (sin cerrarla y abrirla).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch-live.ps1
