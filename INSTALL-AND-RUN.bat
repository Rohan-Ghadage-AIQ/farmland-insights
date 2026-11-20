@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Farmland Insights - install and run

echo ============================================================
echo  Farmland Insights - one-click install and run
echo  Installs anything missing (uv, Node.js, pnpm), then starts the app.
echo ============================================================
echo.

where winget >nul 2>nul
set "HAVE_WINGET=%errorlevel%"

rem ---- uv (runs the Python backend) ---------------------------------------------------------
where uv >nul 2>nul
if errorlevel 1 (
    echo [install] uv ...
    if "%HAVE_WINGET%"=="0" (
        winget install --id astral-sh.uv -e --silent --accept-package-agreements --accept-source-agreements
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    )
    call :refresh_path
)

rem ---- Node.js ------------------------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [install] Node.js ...
    if "%HAVE_WINGET%"=="0" (
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    ) else (
        echo [ERROR] Please install Node.js LTS from https://nodejs.org and run this file again.
        goto fail
    )
    call :refresh_path
)

rem ---- pnpm (installs the frontend packages) ------------------------------------------------
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [install] pnpm ...
    call npm install -g pnpm
    call :refresh_path
)

rem ---- Check everything is now available ----------------------------------------------------
set "MISSING="
where uv   >nul 2>nul || set "MISSING=%MISSING% uv"
where node >nul 2>nul || set "MISSING=%MISSING% node"
where pnpm >nul 2>nul || set "MISSING=%MISSING% pnpm"
if defined MISSING (
    echo.
    echo [ERROR] Still missing:%MISSING%
    echo         Close this window, open it again and double-click INSTALL-AND-RUN.bat once more
    echo         (Windows sometimes needs a new window to see freshly installed tools).
    goto fail
)

echo.
echo All tools are ready. Starting the app...
echo.
call "%~dp0start-app.bat"
exit /b %errorlevel%

:refresh_path
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P;%USERPROFILE%\.local\bin"
exit /b 0

:fail
echo.
pause
exit /b 1
