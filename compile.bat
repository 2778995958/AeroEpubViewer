@echo off
setlocal
cd /d "%~dp0"

set "MSBUILD=C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe"
if not exist "%MSBUILD%" (
    echo MSBuild not found:
    echo %MSBUILD%
    pause
    exit /b 1
)

"%MSBUILD%" "%~dp0AeroEpubViewer.sln" /p:Platform=x64 /p:Configuration=Release
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
    echo.
    echo Build failed: %ERR%
    pause
    exit /b %ERR%
)

echo.
echo Output: %~dp0bin\x64\Release\AeroEpubViewer.exe
pause
