@echo off
setlocal

echo [ABHIORAX] Stopping API...

REM ---- 1. Kill any process listening on port 8080 ----
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:"TCP.*:8080" ^| findstr /I "LISTENING"') do (
  echo [ABHIORAX] Killing API process PID %%a...
  taskkill /PID %%a /T /F >nul 2>&1
)

REM ---- 2. Kill leftover NestJS watch / dev processes ----
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'nest.*start.*--watch|run start:dev|run dev:api|dist\\\\main' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo [ABHIORAX] Done.

endlocal
