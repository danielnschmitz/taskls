@echo off
chcp 65001 >nul
echo ====================================================
echo  TaskLS - Remover Inicialização com o Windows
echo ====================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_FILE=%STARTUP_FOLDER%\TaskLS.vbs"

if exist "%TARGET_FILE%" (
    del /f /q "%TARGET_FILE%"
    echo [SUCESSO] Inicialização automática removida com sucesso.
) else (
    echo [INFO] O TaskLS não estava configurado na pasta de inicialização.
)

echo.
pause
