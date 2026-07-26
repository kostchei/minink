@echo off
setlocal enabledelayedexpansion

:: ====================================================================
:: MINI INK GIT SYNC & SERVER LAUNCHER
:: ====================================================================

echo ========================================================
echo         MINI INK GIT SYNC AND SERVER LAUNCHER
echo ========================================================
echo.

:: STEP 1: GIT ADD .
echo [1/3] Staging files (git add .)...
git add .
if %ERRORLEVEL% neq 0 (
    echo [ERROR] git add failed. Make sure this folder is initialized as a Git repository.
    goto END
)

:: STEP 2: COMMIT AND PUSH
git status --porcelain | findstr . >nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] No changes to commit. Proceeding to push.
) else (
    set /a RANDOM_NUM=%RANDOM% * 1000 + %RANDOM%
    echo [2/3] Committing with message "%RANDOM_NUM%"...
    git commit -m "%RANDOM_NUM%"
    echo [3/3] Pushing to origin main...
    git push origin main
)

:: STEP 3: START LOCAL SERVER
echo Starting Mini Ink local server...

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "Mini Ink Server" py "%~dp0start-mini-ink.py"
) else (
    start "Mini Ink Server" python "%~dp0start-mini-ink.py"
)

echo.
echo ========================================================
echo                 PROCESS COMPLETED!
echo ========================================================

:END
if "%1" neq "--no-pause" pause
endlocal
