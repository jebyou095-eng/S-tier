@echo off
title Velora 360
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org then run this again. & start https://nodejs.org & pause & exit /b 1)
if not exist "backend\node_modules" (echo Installing, first run only... & call npm --prefix backend install || (echo Install failed. & pause & exit /b 1))
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5190"
echo Velora 360 is starting. Keep this window open. Close it to stop the site.
node dev.js
pause
