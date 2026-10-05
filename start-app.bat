@echo off
rem ============================================
rem  StarDew Guide - Start local server & open browser
rem ============================================
title SDV-Guide Starting
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-server.ps1"
echo.
echo This window closes automatically in 8s, or press any key to close now.
timeout /t 8
