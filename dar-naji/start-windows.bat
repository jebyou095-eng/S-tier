@echo off
title Dar Naji
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nest pas installe. Telechargez-le sur https://nodejs.org puis relancez. & start https://nodejs.org & pause & exit /b 1)
if not exist "backend\node_modules" (echo Installation, premier lancement uniquement... & call npm --prefix backend install || (echo Echec de linstallation. & pause & exit /b 1))
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5180"
echo Dar Naji demarre. Gardez cette fenetre ouverte. Fermez-la pour arreter le site.
node dev.js
pause
