' start.vbs - recommended one-click launcher (no console window).
' Double-click this file: it invokes scripts\start_services.ps1 hidden,
' which uses the project-local .venv, starts backend/frontend/simulator
' in the background, and opens http://localhost:5500 once ready.
' All paths are derived from this script's own folder (no hard-coded drive).

Option Explicit
Dim fso, shell, scriptDir, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Folder where this .vbs lives = project root
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = scriptDir & "\scripts\start_services.ps1"

If Not fso.FileExists(ps1) Then
    MsgBox "Launch script not found:" & vbCrLf & ps1, vbCritical, "Forest Fire Platform"
    WScript.Quit 1
End If

' Run PowerShell hidden (0 = hidden window), do not wait (False)
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
shell.Run cmd, 0, False
