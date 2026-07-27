@echo off
title Fechar Folha Rural
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue; if ($connections) { $connections | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host 'Folha Rural encerrado.' } else { Write-Host 'O Folha Rural nao estava em execucao.' }"
timeout /t 2 /nobreak >nul
