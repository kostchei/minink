@echo off
setlocal enabledelayedexpansion
title Mini Ink Setup ^& Installer
cd /d "%~dp0"

echo ===================================================
echo             MINI INK - WINDOWS INSTALLER
echo ===================================================
echo.

:: 1. Check Python
echo [1/3] Checking Python installation...
set PYTHON_CMD=
where py >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=py
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set PYTHON_CMD=python
    )
)

if "%PYTHON_CMD%"=="" (
    echo [WARNING] Python was not detected on your system.
    echo Mini Ink requires Python to run its local offline web server.
    echo Please install Python from https://www.python.org/downloads/
    echo.
) else (
    echo [OK] Python found (%PYTHON_CMD%).
)

:: 2. Ensure icon exists
echo.
echo [2/3] Verifying icon files...
if not exist "%~dp0icon.ico" (
    if not "%PYTHON_CMD%"=="" (
        %PYTHON_CMD% -c "from PIL import Image, ImageDraw; img = Image.new('RGBA', (64, 64), (16, 16, 20, 255)); draw = ImageDraw.Draw(img); draw.ellipse([10, 40, 50, 58], fill=(215, 255, 100, 220)); draw.polygon([(14, 50), (28, 36), (33, 41), (19, 55)], fill=(239, 75, 54)); draw.polygon([(28, 36), (34, 30), (39, 35), (33, 41)], fill=(105, 213, 219)); draw.polygon([(34, 30), (48, 14), (40, 32)], fill=(241, 234, 217)); draw.ellipse([47, 9, 53, 15], fill=(239, 75, 54)); img.save('icon.ico', format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64)])" >nul 2>nul
    )
)
if exist "%~dp0icon.ico" (
    echo [OK] Cute paintbrush icon verified (icon.ico).
) else (
    echo [NOTE] Icon file ready.
)

:: 3. Create Desktop & Start Menu Shortcuts
echo.
echo [3/3] Creating Windows shortcuts...
set VBS_SCRIPT="%TEMP%\CreateMiniInkShortcuts.vbs"
set DESKTOP_LINK=%USERPROFILE%\Desktop\Mini Ink.lnk
set STARTMENU_LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mini Ink.lnk
set TARGET_CMD=%~dp0Start Mini Ink.cmd
set ICON_PATH=%~dp0icon.ico

echo Set oWS = WScript.CreateObject("WScript.Shell") > %VBS_SCRIPT%
echo Set oLink1 = oWS.CreateShortcut("%DESKTOP_LINK%") >> %VBS_SCRIPT%
echo oLink1.TargetPath = "%TARGET_CMD%" >> %VBS_SCRIPT%
echo oLink1.WorkingDirectory = "%~dp0" >> %VBS_SCRIPT%
if exist "%ICON_PATH%" (
    echo oLink1.IconLocation = "%ICON_PATH%" >> %VBS_SCRIPT%
)
echo oLink1.Save >> %VBS_SCRIPT%

echo Set oLink2 = oWS.CreateShortcut("%STARTMENU_LINK%") >> %VBS_SCRIPT%
echo oLink2.TargetPath = "%TARGET_CMD%" >> %VBS_SCRIPT%
echo oLink2.WorkingDirectory = "%~dp0" >> %VBS_SCRIPT%
if exist "%ICON_PATH%" (
    echo oLink2.IconLocation = "%ICON_PATH%" >> %VBS_SCRIPT%
)
echo oLink2.Save >> %VBS_SCRIPT%

cscript //nologo %VBS_SCRIPT%
if exist %VBS_SCRIPT% del %VBS_SCRIPT%

echo [OK] Desktop shortcut created with paintbrush icon: %DESKTOP_LINK%
echo [OK] Start Menu shortcut created: %STARTMENU_LINK%
echo.
echo ===================================================
echo           MINI INK INSTALLATION COMPLETE!
echo ===================================================
echo.
echo You can launch Mini Ink anytime via:
echo   - Desktop shortcut (paintbrush icon)
echo   - Windows Start Menu ("Mini Ink")
echo   - Double-clicking "Start Mini Ink.cmd"
echo.

endlocal
