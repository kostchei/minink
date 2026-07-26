@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $target = '%~dp0Start Mini Ink.cmd'; $work = '%~dp0'; $icon = '%~dp0icon.ico'; $desk = $ws.SpecialFolders('Desktop') + '\Mini Ink.lnk'; $s = $ws.CreateShortcut($desk); $s.TargetPath = $target; $s.WorkingDirectory = $work; if (Test-Path $icon) { $s.IconLocation = $icon }; $s.Save()"

echo Desktop shortcut created for current user with cute paintbrush icon!
endlocal
