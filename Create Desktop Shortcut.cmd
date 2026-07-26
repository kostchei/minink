@echo off
setlocal
cd /d "%~dp0"
set SCRIPT="%TEMP%\CreateShortcut.vbs"
set SHORTCUT=%USERPROFILE%\Desktop\Mini Ink.lnk
set TARGET=%~dp0Start Mini Ink.cmd
set ICON=%~dp0icon.ico

echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = "%SHORTCUT%" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%TARGET%" >> %SCRIPT%
echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
echo oLink.IconLocation = "%ICON%" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%

cscript //nologo %SCRIPT%
del %SCRIPT%

echo Desktop shortcut created for Mini Ink with cute paintbrush icon!
endlocal
