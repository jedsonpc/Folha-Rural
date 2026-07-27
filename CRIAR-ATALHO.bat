@echo off
title Criar atalho - Folha Rural
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalho.ps1"
if errorlevel 1 (
  echo Nao foi possivel criar o atalho automaticamente.
) else (
  echo Atalho Folha Rural criado na Area de Trabalho.
)
pause
