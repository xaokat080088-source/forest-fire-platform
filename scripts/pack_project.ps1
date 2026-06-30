# pack_project.ps1 - package the project into forest-fire-platform.zip
# Invoked by pack.bat. All paths derived from this script location; no hard-coded drive.
# - Stages a clean copy under %TEMP%, excluding runtime/cache files
# - Produces <project-root>\forest-fire-platform.zip
# - zip first level is a single folder: forest-fire-platform\

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$ProjName = "forest-fire-platform"
$OutZip = Join-Path $Root ($ProjName + ".zip")

# Unique staging dir under TEMP: %TEMP%\forest-fire-platform-pack-xxxx
$Stage = Join-Path $env:TEMP ($ProjName + "-pack-" + ([System.Guid]::NewGuid().ToString("N").Substring(0,8)))
$StageProj = Join-Path $Stage $ProjName

Write-Host "Packaging $ProjName ..."
Write-Host "  Source : $Root"
Write-Host "  Staging: $Stage"

# Clean any previous output / staging
if (Test-Path $OutZip) { Remove-Item $OutZip -Force }
if (Test-Path $Stage)  { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $StageProj -Force | Out-Null

# Copy project content into staging\forest-fire-platform, excluding runtime/cache.
# robocopy exit codes 0-7 are success (8+ are errors).
$excludeDirs  = @("__pycache__", ".venv", "venv", "env", ".run", "logs", ".git", ".idea", ".vscode")
$excludeFiles = @("*.pyc", "*.pyo", "*.pyd", "*.zip", "*.log", "*.tmp")

$rcArgs = @($Root, $StageProj, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
$rcArgs += "/XD"; $rcArgs += $excludeDirs
$rcArgs += "/XF"; $rcArgs += $excludeFiles

& robocopy @rcArgs | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) {
    Write-Host "[ERROR] robocopy failed with exit code $rc"
    if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
    exit 1
}

# Safety: also strip any __pycache__ that slipped in (nested)
Get-ChildItem -Path $StageProj -Directory -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Compress staging\forest-fire-platform -> <root>\forest-fire-platform.zip
Write-Host "Compressing -> $OutZip"
Compress-Archive -Path $StageProj -DestinationPath $OutZip -Force

# Clean up staging
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }

if (Test-Path $OutZip) {
    $sizeKB = [math]::Round((Get-Item $OutZip).Length / 1KB, 1)
    Write-Host "Output : $OutZip ($sizeKB KB)"
    Write-Host "Done."
} else {
    Write-Host "[ERROR] Output zip was not created."
    exit 1
}
