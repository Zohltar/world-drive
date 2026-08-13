@echo off
setlocal
cd /d "%~dp0"
title World Drive - Build Windows Release

echo ========================================
echo   World Drive - Build Windows Release
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERREUR: Node.js n'est pas installe sur ce PC de developpement.
  echo Installe Node.js LTS puis relance ce fichier.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERREUR: npm est introuvable.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Installation des dependances...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo [1/2] Dependances deja installees.
)

echo [2/2] Build Vite + installateur Windows + ZIP portable...
call npm run make
if errorlevel 1 goto :error

echo.
echo ========================================
echo BUILD TERMINE

echo Les fichiers distribuables sont dans :
echo   out\make\
echo.
echo Cherche notamment WorldDriveSetup.exe et le ZIP win32-x64.
echo ========================================
explorer "%CD%\out\make"
pause
exit /b 0

:error
echo.
echo ECHEC DU BUILD. Consulte les messages ci-dessus.
pause
exit /b 1
