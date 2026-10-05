@echo off
rem ============================================
rem  StarDew Guide - Stop local server
rem ============================================
title SDV-Guide Stopping
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-server.ps1"
echo.
echo This window closes automatically in 8s, or press any key to close now.
timeout /t 8
