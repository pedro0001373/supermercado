@echo off
title Supermercado Peres - Sistema de Gestao
color 0A
cd /d "%~dp0"
echo.
echo   =============================================
echo   ^|   SUPERMERCADO PERES - Sistema de Gestao  ^|
echo   =============================================
echo.
echo   Iniciando sistema...
echo   Outros computadores da rede poderao acessar.
echo.
node src/desktop.js
if errorlevel 1 (
    echo.
    echo   ERRO: Node.js nao encontrado!
    echo.
    echo   Para instalar, acesse: https://nodejs.org
    echo   Baixe a versao LTS e instale.
    echo   Depois execute este arquivo novamente.
    echo.
    pause
)
