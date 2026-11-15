@echo off
title Agora Marketplace
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org then run this again. & start https://nodejs.org & pause & exit /b 1)
if not exist "backend\node_modules" (echo Installing backend packages, first run only... & call npm --prefix backend install || (echo Install failed. & pause & exit /b 1))
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"
echo Starting Agora. Keep this window open. Close it to stop the site.
node dev.js
pause
