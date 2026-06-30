@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
REM ============================================================
REM  DEBUG launcher: starts services in VISIBLE windows
REM  Use this to troubleshoot. For clean demo use start.bat,
REM  to stop use stop.bat.
REM  - Same .venv isolation, same ports (backend 8000 / frontend 5500)
REM  - Three visible windows: Backend / Simulator / Frontend
REM  Pure ASCII, %~dp0 absolute paths.
REM ============================================================
cd /d "%~dp0"

REM ---- 0) Detect a base Python command: prefer "python", fall back to "py" ----
set "BASEPY="
where python >nul 2>nul && set "BASEPY=python"
if not defined BASEPY (
    where py >nul 2>nul && set "BASEPY=py"
)
if not defined BASEPY (
    echo [ERROR] Python not found. Please install Python 3.9+ and check "Add to PATH", then retry.
    pause
    exit /b 1
)
echo Using base Python command: %BASEPY%

REM ---- 1) Create project-local virtual environment if missing ----
set "VENV_DIR=%~dp0.venv"
set "VPY=%VENV_DIR%\Scripts\python.exe"
if not exist "%VPY%" (
    echo [1/4] Creating virtual environment .venv ...
    %BASEPY% -m venv "%VENV_DIR%"
    if not exist "%VPY%" (
        echo [ERROR] Failed to create virtual environment at "%VENV_DIR%".
        pause
        exit /b 1
    )
) else (
    echo [1/4] Virtual environment .venv already exists, reusing it.
)

REM ---- 2) Install dependencies INTO .venv only ----
echo [2/4] Installing dependencies into .venv ...
"%VPY%" -m pip install --upgrade pip >nul 2>nul
"%VPY%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ERROR] Dependency installation failed. See messages above.
    pause
    exit /b 1
)

REM ---- 3) Start services in VISIBLE windows ----
echo [3/4] Starting backend / simulator / frontend in visible windows...
start "Backend" /d "%~dp0backend" cmd /k ""%VPY%" app.py"
if exist "%~dp0frontend\index.html" (
    start "Frontend" /d "%~dp0scripts" cmd /k ""%VPY%" serve_frontend.py 5500"
) else (
    echo      [WARN] frontend\index.html not found. Frontend will not be started.
)
start "Simulator" /d "%~dp0drone-simulator" cmd /k ""%VPY%" simulator.py"

REM ---- 4) Readiness probe: open browser after backend(8000) and frontend(5500) are up ----
echo [4/4] Waiting for backend(8000) and frontend(5500) to be ready...
set /a tries=0
:waitready
set /a tries+=1
set "BACKOK="
set "FRONTOK="
powershell -NoProfile -Command "try{ (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',8000); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "BACKOK=1"
powershell -NoProfile -Command "try{ (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',5500); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "FRONTOK=1"
if defined BACKOK if defined FRONTOK goto ready
if %tries% geq 30 (
    echo      [WARN] Timed out; opening browser anyway. Check the visible windows for errors.
    goto ready
)
timeout /t 1 /nobreak >nul
goto waitready

:ready
echo      Services are ready, opening browser...
start "" "http://localhost:5500"

echo.
echo ============================================================
echo  DEBUG mode started (3 visible windows).
echo  Frontend page:    http://localhost:5500
echo  Backend API docs: http://localhost:8000/docs
echo  Close the Backend / Simulator / Frontend windows or run stop.bat to stop.
echo ============================================================
endlocal
pause
