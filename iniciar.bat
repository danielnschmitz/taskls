@echo off
chcp 65001 >nul
echo Iniciando TaskLS...
cd /d "%~dp0"
start "" wscript.exe "taskls-launcher.vbs"
timeout /t 2 >nul
echo Abrindo o navegador...
start http://localhost:3333
echo TaskLS está rodando em segundo plano!
pause
