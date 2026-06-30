@echo off
chcp 65001 >nul
REM ============================================================
REM  Forest Fire Platform - VISIBLE launcher / compatibility entry
REM  Runs the same logic as start.vbs (scripts\start_services.ps1)
REM  but in a VISIBLE console so you can watch progress.
REM  For a clean no-window launch, double-click start.vbs instead.
REM  To stop services: stop.bat
REM  Pure ASCII, %~dp0 absolute paths.
REM ============================================================
echo Starting Forest Fire Platform (visible mode)...
echo For a clean no-window launch, use start.vbs instead.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_services.ps1"
echo.
echo ============================================================
echo  Launch logic finished. Services run in the BACKGROUND.
echo  Frontend page:    http://localhost:5500
echo  Backend API docs: http://localhost:8000/docs
echo  Logs:             logs\backend.log / frontend.log / simulator.log
echo  IMPORTANT: closing this window does NOT stop the services.
echo  To STOP all services and free ports 8000/5500: double-click stop.bat
echo  To debug with visible per-service windows: start_debug.bat
echo ============================================================
echo.
echo  Press any key to close this window (services keep running)...
pause >nul
