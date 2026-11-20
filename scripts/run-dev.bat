@echo off
setlocal

set "ROOT=%~dp0..\"

echo Starting backend (FastAPI/uvicorn) in a new window...
start "farmland-backend" cmd /k "cd /d "%ROOT%" && uv run uvicorn app.main:app --reload"

echo Starting frontend (Vite dev server) in a new window...
start "farmland-frontend" cmd /k "cd /d "%ROOT%frontend" && pnpm install && pnpm dev"

echo.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo.
echo Two windows were opened: farmland-backend and farmland-frontend.
echo Close this window any time; the servers keep running in their own windows.

endlocal
