@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
title Farmland Insights - launcher

set "API_PORT=8010"
set "UI_PORT=5173"
set "URL=http://localhost:%UI_PORT%"

rem ---- Clear conflicting GIS environment variables (e.g. from PostgreSQL/PostGIS) ----
set "PROJ_LIB="
set "GDAL_DATA="
set "PROJ_DATA="

rem ---- Auto-detect uv in common Windows install locations if not in PATH ----
where uv >nul 2>nul
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\uv.exe" (
        set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe;%PATH%"
    ) else if exist "%USERPROFILE%\.local\bin\uv.exe" (
        set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    )
)

echo ============================================================
echo  Farmland Insights - starting backend and frontend
echo    API : http://127.0.0.1:%API_PORT%   real satellite and weather data, fake sign-in
echo    UI  : %URL%
echo ============================================================
echo.

rem ---- 1. Required tools -------------------------------------------------------------------
where uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] "uv" was not found. Install it from https://docs.astral.sh/uv/ and run this again.
    goto fail
)
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] "pnpm" was not found. Install it from https://pnpm.io/installation and run this again.
    goto fail
)
where curl >nul 2>nul
if errorlevel 1 (
    echo [ERROR] "curl" was not found. It ships with Windows 10 and later.
    goto fail
)

rem ---- 2. Frontend settings ----------------------------------------------------------------
if not exist "%ROOT%frontend\.env" (
    if exist "%ROOT%frontend\.env.example" (
        copy /y "%ROOT%frontend\.env.example" "%ROOT%frontend\.env" >nul
        echo [setup] Created frontend\.env from frontend\.env.example
    )
)

rem ---- 3. What is already running? ---------------------------------------------------------
set "API_UP=0"
set "UI_UP=0"
curl -sf -o nul -m 2 http://127.0.0.1:%API_PORT%/health && set "API_UP=1"
curl -sf -o nul -m 2 %URL%/ && set "UI_UP=1"

rem ---- 4. Start whatever is not running ----------------------------------------------------
if "%API_UP%"=="1" (
    echo [api] Already running on port %API_PORT%.
) else (
    echo [api] Starting. The first run installs Python packages and can take a few minutes.
    start "Farmland API" cmd /k "cd /d "%ROOT%" && uv run uvicorn scripts.dev_server:app --host 127.0.0.1 --port %API_PORT%"
)

if "%UI_UP%"=="1" (
    echo [ui ] Already running on port %UI_PORT%.
) else (
    echo [ui ] Starting.
    start "Farmland UI" cmd /k "cd /d "%ROOT%frontend" && set VITE_API_PROXY_TARGET=http://127.0.0.1:%API_PORT%&& pnpm install && pnpm dev --port %UI_PORT% --strictPort"
)

rem ---- 5. Wait until both answer (up to about 5 minutes) -----------------------------------
echo.
echo Waiting for both to be ready...
set /a TRIES=0
:wait
set /a TRIES+=1
if %TRIES% gtr 150 goto timeout
curl -sf -o nul -m 2 http://127.0.0.1:%API_PORT%/health
if errorlevel 1 goto again
curl -sf -o nul -m 2 %URL%/
if errorlevel 1 goto again
goto ready
:again
ping -n 3 127.0.0.1 >nul
goto wait

:ready
echo.
echo Ready.
if not defined NO_BROWSER start "" "%URL%"
echo.
echo   Open   %URL%
echo   Sign in with any email and any password (local use only).
echo   Analyses take under a minute; a full year can take a minute or two.
echo.
echo   To stop the app, close the "Farmland API" and "Farmland UI" windows.
echo.
timeout /t 8 >nul
exit /b 0

:timeout
echo.
echo [ERROR] The app did not become ready in time.
echo         Look at the "Farmland API" and "Farmland UI" windows for the error message.
echo         If port %UI_PORT% or %API_PORT% is used by another program, close it and try again.
goto fail

:fail
echo.
pause
exit /b 1
