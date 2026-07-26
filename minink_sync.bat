@echo off
setlocal enabledelayedexpansion

:: ====================================================================
:: MINI INK GIT SYNC & SERVER LAUNCHER
:: ====================================================================
:: Configurable Roblox Place ID / Universe ID (if linked to Roblox)
set PLACE_ID=YOUR_PLACE_ID
set UNIVERSE_ID=YOUR_UNIVERSE_ID
set ROBLOX_API_KEY=YOUR_OPENCLOUD_API_KEY
set ROJO_PROJECT=default.project.json
set BUILD_OUTPUT=build.rbxl
:: ====================================================================

echo ========================================================
echo         MINI INK GIT SYNC AND DEPLOYMENT AUTOMATION
echo ========================================================
echo.

:: STEP 1: GIT ADD .
echo [1/5] Staging files (git add .)...
git add .
if %ERRORLEVEL% neq 0 (
    echo [ERROR] git add failed. Make sure this folder is initialized as a Git repository.
    goto END
)

:: STEP 2: COMMIT WITH RANDOM NUMBER
set /a RANDOM_NUM=%RANDOM% * 1000 + %RANDOM%
echo [2/5] Committing with message "%RANDOM_NUM%"...

git status --porcelain | findstr . >nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] No changes to commit. Proceeding to push/sync.
) else (
    git commit -m "%RANDOM_NUM%"
)

:: STEP 3: PUSH TO ORIGIN MAIN
echo [3/5] Pushing to origin main...
git push origin main
if %ERRORLEVEL% neq 0 (
    echo [WARNING] git push failed or remote branch not ready. Continuing to server start...
)

:: STEP 4: ROBLOX REMOTE UPDATE (If applicable)
if exist "%ROJO_PROJECT%" (
    echo [4/5] Building & updating Roblox place on remote...
    rojo build "%ROJO_PROJECT%" --output "%BUILD_OUTPUT%"
    if not "%ROBLOX_API_KEY%"=="YOUR_OPENCLOUD_API_KEY" (
        if not "%UNIVERSE_ID%"=="YOUR_UNIVERSE_ID" (
            curl -s -X POST "https://apis.roblox.com/universes/v1/%UNIVERSE_ID%/places/%PLACE_ID%/versions?versionType=Published" ^
                 -H "x-api-key: %ROBLOX_API_KEY%" ^
                 -H "Content-Type: application/octet-stream" ^
                 --data-binary @"%BUILD_OUTPUT%"
        )
    )
)

:: STEP 5: START LOCAL SERVER & OPEN IN BROWSER
echo [5/5] Starting Mini Ink local server...

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "Mini Ink Server" py "%~dp0start-mini-ink.py"
) else (
    start "Mini Ink Server" python "%~dp0start-mini-ink.py"
)

if not "%PLACE_ID%"=="YOUR_PLACE_ID" (
    echo Launching Roblox client...
    start "" "roblox-player://placeId=%PLACE_ID%"
)

echo.
echo ========================================================
echo                 PROCESS COMPLETED!
echo ========================================================

:END
if "%1" neq "--no-pause" pause
