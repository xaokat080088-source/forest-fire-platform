# start_services.ps1 - actual launch logic for the Forest Fire Platform.
# Invoked hidden by start.vbs (no console window) or visibly by start.bat.
# - Creates/uses project-local .venv (no global Python pollution)
# - Starts backend(8000) / frontend(5500) / simulator in background
# - Logs to logs\*.log, PIDs to logs\pids.txt
# - Opens browser after backend(8000) and frontend(5500) are ready
# Paths are all derived from this script location; no hard-coded drive.

$ErrorActionPreference = "Stop"

# Project root = parent of this script's folder (scripts\..)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Logs = Join-Path $Root "logs"
$VenvPy = Join-Path $Root ".venv\Scripts\python.exe"

if (-not (Test-Path $Logs)) { New-Item -ItemType Directory -Path $Logs | Out-Null }

function Log([string]$m) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m
    Write-Output $line
    Add-Content -Path (Join-Path $Logs "launcher.log") -Value $line -Encoding ascii
}

# ---- 0) Detect base Python (python -> py) ----
$BasePy = $null
if (Get-Command python -ErrorAction SilentlyContinue) { $BasePy = "python" }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $BasePy = "py" }
if (-not $BasePy) {
    Log "[ERROR] Python not found. Install Python 3.9+ and add to PATH."
    exit 1
}

# ---- 1) Create .venv if missing ----
if (-not (Test-Path $VenvPy)) {
    Log "Creating virtual environment .venv ..."
    & $BasePy -m venv (Join-Path $Root ".venv")
    if (-not (Test-Path $VenvPy)) { Log "[ERROR] Failed to create .venv"; exit 1 }
} else {
    Log "Reusing existing .venv"
}

# ---- 2) Install dependencies into .venv ----
Log "Installing dependencies into .venv ..."
& $VenvPy -m pip install --upgrade pip 2>&1 | Out-Null
& $VenvPy -m pip install -r (Join-Path $Root "requirements.txt") 2>&1 |
    Add-Content -Path (Join-Path $Logs "pip.log") -Encoding ascii

# ---- 3) Start services hidden, redirect logs, save PIDs ----
$PidFile = Join-Path $Logs "pids.txt"
Remove-Item $PidFile -ErrorAction SilentlyContinue

function Start-Svc([string]$name, [string]$workdir, [string[]]$pyargs) {
    $out = Join-Path $Logs ($name + ".log")
    $err = Join-Path $Logs ($name + ".err.log")
    $p = Start-Process -FilePath $VenvPy -ArgumentList $pyargs `
        -WorkingDirectory $workdir -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    Add-Content -Path $PidFile -Value ("{0}={1}" -f $name, $p.Id) -Encoding ascii
    Log ("started {0} (PID {1})" -f $name, $p.Id)
    return $p
}

Log "Starting backend / frontend / simulator in background ..."
Start-Svc "backend"   (Join-Path $Root "backend")         @("app.py") | Out-Null
if (Test-Path (Join-Path $Root "frontend\index.html")) {
    Start-Svc "frontend" (Join-Path $Root "scripts") @("serve_frontend.py","5500") | Out-Null
} else {
    Log "[WARN] frontend\index.html not found; frontend not started."
}
Start-Svc "simulator" (Join-Path $Root "drone-simulator") @("simulator.py") | Out-Null

# ---- 4) Readiness probe: backend(8000) + frontend(5500), then open browser ----
function Test-Port([int]$port) {
    try { (New-Object Net.Sockets.TcpClient).Connect("127.0.0.1", $port); return $true }
    catch { return $false }
}

Log "Waiting for backend(8000) and frontend(5500) to be ready ..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    if ((Test-Port 8000) -and (Test-Port 5500)) { $ready = $true; break }
    Start-Sleep -Milliseconds 800
}
if ($ready) { Log "Services ready." } else { Log "[WARN] Timed out waiting; opening browser anyway." }

Start-Process "http://localhost:5500"
Log "Opened http://localhost:5500"
