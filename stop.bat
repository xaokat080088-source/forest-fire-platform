@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
REM ============================================================
REM  Stop background services started by start.vbs / start.bat
REM  1) Kill PIDs saved in logs\pids.txt
REM  2) Kill any process launched from THIS project's .venv python
REM     (precisely our backend/frontend/simulator; never touches
REM      the system Python or other projects)
REM  3) Fallback: free ports 8000 / 5500
REM  Pure ASCII, %~dp0 absolute paths.
REM ============================================================
cd /d "%~dp0"

echo Stopping Forest Fire Platform background services...

REM ---- 1) Kill by saved PIDs ----
set "PIDFILE=%~dp0logs\pids.txt"
if exist "%PIDFILE%" (
    for /f "usebackq tokens=1,2 delims==" %%A in ("%PIDFILE%") do (
        echo   stopping %%A - PID %%B ...
        taskkill /F /PID %%B >nul 2>nul
    )
    del /q "%PIDFILE%" >nul 2>nul
) else (
    echo   [INFO] logs\pids.txt not found, using venv + port cleanup.
)

REM ---- 2) Kill any process started from THIS project's .venv python ----
REM  Matches only our own venv interpreter path, so the system Python
REM  and unrelated projects are left untouched.
set "VENVPY=%~dp0.venv\Scripts\python.exe"
powershell -NoProfile -Command "$t='%VENVPY%'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $t } | ForEach-Object { Write-Host ('   stopping venv python PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM ---- 3) Fallback: free ports 8000 and 5500 by killing their listeners ----
for %%P in (8000 5500) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        echo   freeing port %%P - PID %%I ...
        taskkill /F /PID %%I >nul 2>nul
    )
)

echo.
echo ============================================================
echo  All services stopped. Ports 8000 / 5500 should be free now.
echo ============================================================
endlocal
pause
