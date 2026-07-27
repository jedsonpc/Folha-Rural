@echo off
title Folha Rural
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Execute primeiro o arquivo INSTALAR.bat.
  exit /b 1
)

for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo.
  echo O Folha Rural precisa do Node.js 22 ou mais recente.
  echo Versao encontrada:
  node --version
  echo Atualize pelo site https://nodejs.org/ e execute o atalho novamente.
  exit /b 1
)

if not exist "node_modules" (
  echo Execute primeiro o arquivo INSTALAR.bat.
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo A instalacao dos componentes esta incompleta.
  echo Execute novamente o arquivo INSTALAR.bat.
  exit /b 1
)

call "%~dp0node_modules\.bin\vite.cmd" --host 127.0.0.1 --port 4173
exit /b %ERRORLEVEL%
