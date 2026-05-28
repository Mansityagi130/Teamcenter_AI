@echo off
title Teamcenter AI Autostart
cd /d "c:\Users\mansi\Downloads\prsproject"

echo Checking if port 8000 is already in use...
netstat -ano | findstr :8000 >nul
if %errorlevel% equ 0 (
    echo Teamcenter AI Backend is already running on port 8000.
    echo No need to restart.
    timeout /t 5 >nul
    exit /b
)

echo Starting Teamcenter AI Backend server...
echo Pointing to virtualenv python and running uvicorn...
venv\Scripts\python.exe -m uvicorn backend:app --host 127.0.0.1 --port 8000

pause
