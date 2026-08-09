@echo off
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js / npm n'est pas installe ou n'est pas dans PATH.
  echo Installe Node.js LTS, puis relance ce fichier.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
echo.
echo Demarrage de World Drive...
echo Une adresse http://localhost:... va apparaitre.
echo.
call npm run dev
pause
