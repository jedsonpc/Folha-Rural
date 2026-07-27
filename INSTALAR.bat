@echo off
title Instalacao - Folha Rural
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js ainda nao esta instalado neste computador.
  echo Instale a versao LTS em https://nodejs.org/ e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo.
  echo A versao instalada do Node.js e antiga:
  node --version
  echo Instale a versao LTS atual em https://nodejs.org/ e tente novamente.
  pause
  exit /b 1
)

echo Instalando os componentes do Folha Rural. Aguarde a conclusao...
call npm install --no-audit --no-fund
if errorlevel 1 goto erro

echo Criando o atalho na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalho.ps1"
if errorlevel 1 echo O sistema foi instalado, mas o atalho devera ser criado pelo arquivo CRIAR-ATALHO.bat.

echo.
echo Instalacao concluida com sucesso.
echo Use o atalho Folha Rural na Area de Trabalho para abrir o sistema.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir a instalacao.
echo Verifique a conexao com a internet e tente novamente.
pause
exit /b 1
