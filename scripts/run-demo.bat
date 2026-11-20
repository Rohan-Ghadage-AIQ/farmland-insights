@echo off
setlocal

set "ROOT=%~dp0..\"

echo Starting MOCK backend (synthetic data, no credentials needed) in a new window...
start "farmland-mock-api" cmd /k "cd /d "%ROOT%frontend" && node scripts\mock-api.mjs"

echo Starting frontend (Vite dev server) in a new window...
start "farmland-frontend" cmd /k "cd /d "%ROOT%frontend" && pnpm install && pnpm dev"

echo.
echo Open http://localhost:5173 and sign in with any email via "Get token".
echo All analysis numbers in this mode are synthetic. Use run-dev.bat for the real backend.

endlocal
