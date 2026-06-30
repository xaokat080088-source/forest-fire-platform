@echo off
chcp 65001 >nul
REM ============================================================
REM  pack.bat - package the project into forest-fire-platform.zip
REM  Pure ASCII entry point; real logic in scripts\pack_project.ps1
REM  Excludes .venv / logs / .run / __pycache__ / *.pyc / *.zip
REM  zip first level is a single folder: forest-fire-platform\
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pack_project.ps1"
echo.
pause
