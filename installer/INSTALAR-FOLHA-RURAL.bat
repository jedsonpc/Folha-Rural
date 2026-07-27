@echo off
title Instalador Completo - Folha Rural
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-folha-rural.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao nao foi concluida. Leia a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Instalacao concluida. Use o atalho Folha Rural na Area de Trabalho.
pause
