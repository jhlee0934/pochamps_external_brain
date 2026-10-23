@echo off
setlocal
cd /d "%~dp0"

if /i "%~1"=="web" goto web
if /i "%~1"=="mcp" goto mcp
if /i "%~1"=="tunnel" goto tunnel

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not on PATH.
  goto failed
)
if not exist "server\.env" (
  echo [ERROR] Create server\.env from server\.env.example and set MCP_PATH_SECRET.
  goto failed
)
if not exist "server\node_modules\.bin\tsx.cmd" (
  echo [ERROR] Run: npm --prefix server install
  goto failed
)
if not exist "web\node_modules\.bin\vite.cmd" (
  echo [ERROR] Run: npm --prefix web install
  goto failed
)

set "CLOUDFLARED_EXE="
for /f "delims=" %%F in ('where cloudflared.exe 2^>nul') do set "CLOUDFLARED_EXE=%%F"
if not defined CLOUDFLARED_EXE if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED_EXE=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED_EXE if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED_EXE=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED_EXE (
  echo [ERROR] cloudflared.exe was not found. Install it or add it to PATH.
  goto failed
)

node --env-file=server/.env -e "const p=Number(process.env.PORT || 8787); if (!Number.isInteger(p) || p<1 || p>65535 || (process.env.MCP_PATH_SECRET || '').length<16) { console.error('[ERROR] Check PORT and MCP_PATH_SECRET (16+ chars) in server/.env.'); process.exit(1); }"
if errorlevel 1 goto failed
for /f "delims=" %%P in ('node --env-file=server/.env -p "Number(process.env.PORT || 8787)"') do set "MCP_PORT=%%P"
if /i "%~1"=="--check" (
  echo [OK] Prerequisites ready. Web: 5173, MCP: %MCP_PORT%.
  exit /b 0
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue) { exit 0 }; exit 1"
if errorlevel 1 (
  start "pochamps - Web" cmd /d /k ""%~f0" web"
) else (
  echo [SKIP] Port 5173 is already in use. Web was not started.
)
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %MCP_PORT% -ErrorAction SilentlyContinue) { exit 0 }; exit 1"
if errorlevel 1 (
  start "pochamps - MCP" cmd /d /k ""%~f0" mcp"
) else (
  echo [SKIP] Port %MCP_PORT% is already in use. MCP was not started.
)
powershell -NoProfile -Command "if (Get-Process cloudflared -ErrorAction SilentlyContinue) { exit 0 }; exit 1"
if errorlevel 1 (
  start "pochamps - Tunnel" cmd /d /k ""%~f0" tunnel"
) else (
  echo [SKIP] cloudflared is already running. Check its existing tunnel URL and target.
)
echo.
echo Web: http://localhost:5173
echo MCP: http://localhost:%MCP_PORT%/mcp/^<MCP_PATH_SECRET^>
echo Use the HTTPS URL printed in the tunnel window, followed by /mcp/^<MCP_PATH_SECRET^>.
echo The quick tunnel URL changes on restart. Stop each service with Ctrl+C in its window.
pause
exit /b 0

:web
cd /d "%~dp0web"
call npm.cmd run dev -- --port 5173 --strictPort
exit /b %errorlevel%

:mcp
cd /d "%~dp0server"
call npm.cmd run dev
exit /b %errorlevel%

:tunnel
"%CLOUDFLARED_EXE%" tunnel --url "http://localhost:%MCP_PORT%"
exit /b %errorlevel%

:failed
if /i "%~1"=="--check" exit /b 1
pause
exit /b 1