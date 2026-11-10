@echo off
setlocal
title ABHIORAX - API
cd /d "%~dp0"

echo ============================================
echo   ABHIORAX API - start script
echo ============================================
echo.

REM ---- 1. Make sure PostgreSQL is running ----
sc query postgresql-x64-18 | findstr /I "RUNNING" >nul 2>&1
if errorlevel 1 (
  echo [1/3] Starting PostgreSQL service...
  net start postgresql-x64-18 >nul 2>&1
) else (
  echo [1/3] PostgreSQL is already running.
)

REM ---- 2. Stop an existing API instance (if any) ----
echo [2/3] Stopping any existing API instance...
call "%~dp0kill.bat" >nul 2>&1

REM ---- 3. Install deps if missing ----
if not exist "node_modules" (
  echo [3/3] Installing dependencies...
  call npm install
) else (
  echo [3/3] Dependencies present.
)

echo.
echo API will be at: http://localhost:8080/docs
echo Press Ctrl+C to stop.
echo.
call npm run dev:api

endlocal
