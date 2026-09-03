@echo off
cd /d "%~dp0"
start "" http://localhost:8777
python serve.py 8777
if errorlevel 1 pause
