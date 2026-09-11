@echo off
chcp 65001 >nul
echo ====================================================
echo  TaskLS - Configurar Inicialização com o Windows
echo ====================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_FILE=%STARTUP_FOLDER%\TaskLS.vbs"
set "CURRENT_DIR=%~dp0.."

echo Copiando inicializador silencioso para:
echo %TARGET_FILE%
echo.

(
echo ' Launcher Silencioso para TaskLS
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%CURRENT_DIR%"
echo WshShell.Run "node dist/server/server.js", 0, False
) > "%TARGET_FILE%"

if exist "%TARGET_FILE%" (
    echo [SUCESSO] TaskLS configurado para iniciar automaticamente com o Windows!
    echo Sempre que o computador ligar, você poderá abrir http://localhost:3333 no navegador.
) else (
    echo [ERRO] Não foi possível criar o arquivo na pasta de inicialização.
)

echo.
pause
