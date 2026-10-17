@echo off
cd /d "%~dp0\..\.."
call npm.cmd run collect:115
pause
