@echo off
title MediFind Server
cd /d "%~dp0"
echo Compiling MediFind...
if not exist out mkdir out
javac -encoding UTF-8 -d out src\medifind\*.java
if errorlevel 1 (
  echo.
  echo Compilation failed. Please install JDK 11 or newer and try again.
  pause
  exit /b 1
)
echo Starting server...
start "" http://localhost:8080
java -cp out medifind.Server
pause
