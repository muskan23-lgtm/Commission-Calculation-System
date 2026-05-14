@echo off
setlocal

cd /d "%~dp0"

if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

set "NPM_CMD=npm"
where npm.cmd >nul 2>nul
if errorlevel 1 (
    if exist "C:\Program Files\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
)

if "%~1"=="" goto help
if /i "%~1"=="install" goto install
if /i "%~1"=="dev" goto dev
if /i "%~1"=="build" goto build
if /i "%~1"=="preview" goto preview
if /i "%~1"=="lint" goto lint
if /i "%~1"=="typecheck" goto typecheck

echo Unknown command: %~1
echo.
goto help

:install
"%NPM_CMD%" install
exit /b %ERRORLEVEL%

:dev
"%NPM_CMD%" run dev
exit /b %ERRORLEVEL%

:build
"%NPM_CMD%" run build
exit /b %ERRORLEVEL%

:preview
"%NPM_CMD%" run preview
exit /b %ERRORLEVEL%

:lint
"%NPM_CMD%" run lint
exit /b %ERRORLEVEL%

:typecheck
"%NPM_CMD%" run typecheck
exit /b %ERRORLEVEL%

:help
echo Usage: run-frontend.cmd ^<install^|dev^|build^|preview^|lint^|typecheck^>
exit /b 1
