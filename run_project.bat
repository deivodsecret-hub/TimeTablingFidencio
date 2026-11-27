@echo off

echo ==========================================
echo      University Timetabling Project
echo ==========================================

REM Ensure Node.js and npm are in PATH
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

REM Check or compile backend
if exist "%~dp0backend\solver.exe" goto :backend_ready

where g++ >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: backend\solver.exe not found and g++ not in PATH.
    pause
    exit /b 1
)

echo [1/4] Compiling Backend (solver.cpp)...
g++ "%~dp0backend\solver.cpp" -o "%~dp0backend\solver.exe"
if %errorlevel% neq 0 (
    echo Error: Compilation failed!
    pause
    exit /b %errorlevel%
)
echo Compilation successful.
goto :start_services

:backend_ready
echo [1/4] Backend binary found (backend\solver.exe). Skipping compilation.

:start_services
REM Start local Ollama server if installed and not already running
set "OLLAMA_HOST=127.0.0.1:11434"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    netstat -ano | findstr ":11434 " >nul 2>nul || start "Ollama Local LLM" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
)

echo [2/4] Starting Node.js Server...
start "Node Server" /d "%~dp0server" cmd /k "npm start"

echo [3/4] Starting Frontend (Vite)...
start "Frontend" /d "%~dp0frontend" cmd /k "npm run dev"

echo [4/4] Opening Browser...
echo Waiting 5 seconds for services to initialize...
ping 127.0.0.1 -n 6 >nul
start http://localhost:5173

echo ==========================================
echo Project is running!
echo Close the opened terminal windows to stop.
echo ==========================================
