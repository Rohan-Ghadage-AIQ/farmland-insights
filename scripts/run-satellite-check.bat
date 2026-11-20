@echo off
setlocal
cd /d "%~dp0.."

echo ============================================================
echo  Satellite check: Sentinel-1, Sentinel-2, Landsat + indices
echo  (no PropelAuth / Earth Engine credentials needed)
echo ============================================================
echo.
echo Area options:
echo   1 = farm boundary file (GeoJSON / GPKG / shapefile)
echo   2 = lon/lat box (west south east north)
set /p MODE="Choose 1 or 2 [1]: "
if "%MODE%"=="" set MODE=1

if "%MODE%"=="2" (
    set /p BBOX="Enter: west south east north (e.g. 72.400 23.600 72.405 23.605): "
    set "AREA=--bbox %BBOX%"
) else (
    set /p GEOFILE="Path to boundary file (drag the file here): "
    set "GEOFILE=%GEOFILE:"=%"
    set AREA=--geojson "%GEOFILE%"
)

set /p START="Start date YYYY-MM-DD [2024-01-01]: "
if "%START%"=="" set START=2024-01-01
set /p END="End date   YYYY-MM-DD [2024-02-15]: "
if "%END%"=="" set END=2024-02-15
set /p GRID="Grid cell size in metres [50]: "
if "%GRID%"=="" set GRID=50

echo.
echo Running... (reads imagery over the internet; can take a minute or two)
echo.
uv run python scripts\check_satellite.py %AREA% --start %START% --end %END% --grid %GRID%

echo.
pause
endlocal
