@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo [guanjia] 找不到 Node.js。请安装 Node.js 18+（推荐 22+）后重试。 1>&2
  exit /b 3
)
node "%~dp0bin\guanjia.mjs" %* --project "%PROJECT_ROOT%"
exit /b %ERRORLEVEL%
