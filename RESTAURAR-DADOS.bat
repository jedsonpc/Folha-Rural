@echo off
title Restaurar dados - Folha Rural
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restaurar-dados.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel restaurar. A base atual foi preservada.
  pause
  exit /b 1
)
echo.
echo Restauracao concluida. Abra novamente o Folha Rural.
pause
