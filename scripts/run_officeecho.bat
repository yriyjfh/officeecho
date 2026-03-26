@echo off
chcp 936 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "MODE="
set "START_BACKEND=true"
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR="
set "LOG_DIR="
set "PYTHON_CMD="
set "PYTHON_ARG="
set "BACKEND_ENV=%~dp0officeecho_env"
set "BACKEND_PYTHON=%BACKEND_ENV%\Scripts\python.exe"
set "RUN_DIR="
set "BACKEND_PID="
set "ADMIN_PID="
set "VISITOR_PID="
set "ELECTRON_PID="

:parse_args
if "%~1"=="" goto check_mode
if /i "%~1"=="--dev" (
    set "MODE=dev"
    shift
    goto parse_args
)
if /i "%~1"=="--prod" (
    set "MODE=prod"
    shift
    goto parse_args
)
if /i "%~1"=="--no-backend" (
    set "START_BACKEND=false"
    shift
    goto parse_args
)
if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help
echo 未知参数: %~1
goto show_help

:show_help
echo.
echo OfficeEcho 启动脚本 ^(Windows 版本^)
echo.
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   --dev          开发模式: 启动 Vite 开发服务器
echo   --prod         生产模式: 构建并启动 Electron
echo   --no-backend   跳过后端启动
echo   --help, -h     显示帮助信息
echo.
echo 示例:
echo   %~nx0
echo   %~nx0 --dev
echo   %~nx0 --prod
echo.
exit /b 0

:check_mode
if not defined MODE (
    call :select_mode
)

echo ========================================
echo        OfficeEcho 一键启动系统
echo ========================================
echo.
if /i "%MODE%"=="dev" (
    echo [启动模式] 开发模式
) else (
    echo [启动模式] 生产模式
)
echo.

set "LOG_DIR=%USERPROFILE%\OfficeEcho\logs"
if not exist "%LOG_DIR%" (
    mkdir "%LOG_DIR%" >nul 2>&1
)
set "RUN_DIR=%LOG_DIR%\run_%RANDOM%_%RANDOM%"
mkdir "%RUN_DIR%" >nul 2>&1
if not exist "%RUN_DIR%" (
    echo [错误] 无法创建本次运行目录: %RUN_DIR%
    pause
    exit /b 1
)
echo [信息] 日志根目录: %LOG_DIR%
echo [信息] 本次运行目录: %RUN_DIR%
echo.

for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_DIR=%%~fI"
if not exist "%PROJECT_DIR%" (
    echo [错误] 找不到项目目录: %PROJECT_DIR%
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

if not exist "node_modules\" (
    echo [信息] 正在安装前端依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] npm install 失败。
        pause
        exit /b 1
    )
)

call :detect_python
if errorlevel 1 exit /b 1

if "%START_BACKEND%"=="true" (
    call :ensure_backend_env
    if errorlevel 1 exit /b 1
)

call :cleanup_existing_processes
if errorlevel 1 exit /b 1

if "%START_BACKEND%"=="true" (
    echo [1/4] 正在启动后端服务 ^(端口 8000^)...
    call :start_hidden_command "%PROJECT_DIR%\server" """%BACKEND_PYTHON%"" app.py >> ""%RUN_DIR%\backend.log"" 2>&1" BACKEND_PID
    if errorlevel 1 exit /b 1
    echo [信息] 已请求启动后端服务，启动器 PID: !BACKEND_PID!
    timeout /t 2 /nobreak >nul
) else (
    echo [1/4] 跳过后端启动 ^(--no-backend^)
)

echo [2/4] 正在启动管理端 ^(端口 3001^)...
call :start_hidden_command "%PROJECT_DIR%" "call node_modules\.bin\vite.cmd --config vite.config.family.ts >> ""%RUN_DIR%\admin.log"" 2>&1" ADMIN_PID
if errorlevel 1 exit /b 1
echo [信息] 已请求启动管理端，启动器 PID: !ADMIN_PID!
timeout /t 2 /nobreak >nul

if /i "%MODE%"=="dev" (
    echo [3/4] 正在启动屏幕端 ^(开发模式, 端口 3000^)...
    call :start_hidden_command "%PROJECT_DIR%" "call node_modules\.bin\vite.cmd --config vite.config.elderly.ts >> ""%RUN_DIR%\visitor.log"" 2>&1" VISITOR_PID
    if errorlevel 1 exit /b 1
    echo [信息] 已请求启动屏幕端，启动器 PID: !VISITOR_PID!
    echo [4/4] 正在等待前端服务稳定...
    call :wait_for_port 3001 30
    if errorlevel 1 exit /b 1
    call :wait_for_port 3000 30
    if errorlevel 1 exit /b 1
    echo ========================================
    echo 已按开发模式请求启动服务。
    echo 屏幕端: http://localhost:3000/visitor.html
    echo 管理端: http://localhost:3001/admin.html
    echo 开发模式不启动 Electron，请直接使用浏览器访问上述地址。
    echo ========================================
    echo.
    echo 按任意键停止已启动的服务。
    call :wait_for_exit_key
) else (
    echo [3/4] 正在构建并启动 Electron...
    set "CSC_IDENTITY_AUTO_DISCOVERY=false"
    set "WIN_CSC_LINK="
    set "WIN_CSC_KEY_PASSWORD="
    call npm run build:electron > "%RUN_DIR%\build.log" 2>&1
    if errorlevel 1 (
        echo [错误] Electron 构建失败，请检查 %RUN_DIR%\build.log
        pause
        exit /b 1
    )

    set "ELECTRON_EXE="
    for /r "dist-electron" %%F in (*.exe) do (
        if not defined ELECTRON_EXE set "ELECTRON_EXE=%%~fF"
    )

    if not defined ELECTRON_EXE (
        echo [错误] 未在 dist-electron 中找到 Electron 可执行文件。
        pause
        exit /b 1
    )

    echo [信息] 正在启动 Electron: !ELECTRON_EXE!
    call :start_executable "!ELECTRON_EXE!" "%PROJECT_DIR%" ELECTRON_PID
    if errorlevel 1 exit /b 1
    echo [信息] 已启动 Electron，PID: !ELECTRON_PID!
    echo [4/4] 已请求启动服务。
    timeout /t 2 /nobreak >nul
    echo ========================================
    echo 已按生产模式请求启动服务。
    echo 管理端: http://localhost:3001/admin.html
    echo ========================================
    echo.
    echo 按任意键停止已启动的服务。
    call :wait_for_exit_key
)

chcp 936 >nul
echo.
echo [信息] 正在停止已启动的服务...
call :stop_tracked_process "!ELECTRON_PID!" "Electron"
call :stop_tracked_process "!VISITOR_PID!" "屏幕端"
call :stop_tracked_process "!ADMIN_PID!" "管理端"
call :stop_tracked_process "!BACKEND_PID!" "后端服务"
echo [信息] 本次运行日志已保存到: %RUN_DIR%
exit /b 0

:wait_for_exit_key
pause >nul 2>nul
chcp 936 >nul
exit /b 0

:cleanup_existing_processes
echo [信息] 正在清理旧的端口占用...
call :kill_port 3000
call :kill_port 3001
if "%START_BACKEND%"=="true" call :kill_port 8000
timeout /t 1 /nobreak >nul
echo.
exit /b 0

:kill_port
setlocal EnableDelayedExpansion
set "TARGET_PORT=%~1"
set "FOUND_PIDS= "
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%TARGET_PORT% .*LISTENING"') do (
    echo !FOUND_PIDS! | find " %%P " >nul
    if errorlevel 1 (
        set "FOUND_PIDS=!FOUND_PIDS!%%P "
        taskkill /PID %%P /T /F >nul 2>&1
        if not errorlevel 1 (
            echo [信息] 已释放端口 %TARGET_PORT% ^(PID %%P^)
        )
    )
)
endlocal
exit /b 0

:start_hidden_command
setlocal
set "START_WORKDIR=%~1"
set "START_CMD=%~2"
set "PID_FILE=%TEMP%\officeecho_pid_%RANDOM%_%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $env:START_WORKDIR -ArgumentList @('/d','/s','/c', $env:START_CMD) -WindowStyle Hidden -PassThru; Set-Content -Path $env:PID_FILE -Value $p.Id"
if errorlevel 1 (
    echo [错误] 启动后台进程失败。
    endlocal & exit /b 1
)
set "START_PID="
for /f "usebackq delims=" %%P in ("%PID_FILE%") do set "START_PID=%%P"
del "%PID_FILE%" >nul 2>&1
if not defined START_PID (
    echo [错误] 未能获取后台进程 PID。
    endlocal & exit /b 1
)
endlocal & set "%~3=%START_PID%"
exit /b 0

:start_executable
setlocal
set "EXE_PATH=%~1"
set "EXE_WORKDIR=%~2"
set "PID_FILE=%TEMP%\officeecho_pid_%RANDOM%_%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath $env:EXE_PATH -WorkingDirectory $env:EXE_WORKDIR -PassThru; Set-Content -Path $env:PID_FILE -Value $p.Id"
if errorlevel 1 (
    echo [错误] 启动 Electron 失败。
    endlocal & exit /b 1
)
set "START_PID="
for /f "usebackq delims=" %%P in ("%PID_FILE%") do set "START_PID=%%P"
del "%PID_FILE%" >nul 2>&1
if not defined START_PID (
    echo [错误] 未能获取 Electron PID。
    endlocal & exit /b 1
)
endlocal & set "%~3=%START_PID%"
exit /b 0

:stop_tracked_process
setlocal
set "TARGET_PID=%~1"
set "TARGET_NAME=%~2"
if not defined TARGET_PID exit /b 0
taskkill /PID %TARGET_PID% /T /F >nul 2>&1
if errorlevel 1 (
    echo [信息] %TARGET_NAME% ^(PID %TARGET_PID%^) 已退出或无需停止。
) else (
    echo [信息] 已停止 %TARGET_NAME% ^(PID %TARGET_PID%^)
)
endlocal
exit /b 0

:wait_for_port
setlocal EnableDelayedExpansion
set "TARGET_PORT=%~1"
set "MAX_WAIT=%~2"
set /a ELAPSED=0
:wait_for_port_loop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$client = New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1', [int]$env:TARGET_PORT); exit 0 } catch { exit 1 } finally { if ($client) { $client.Dispose() } }" >nul 2>&1
if not errorlevel 1 (
    endlocal & exit /b 0
)
if !ELAPSED! GEQ %MAX_WAIT% (
    echo [错误] 等待端口 %TARGET_PORT% 就绪超时。
    endlocal & exit /b 1
)
timeout /t 1 /nobreak >nul
set /a ELAPSED+=1
goto wait_for_port_loop

:detect_python
set "PYTHON_CMD="
set "PYTHON_ARG="
set "PY_LIST_FILE=%TEMP%\officeecho_py_%RANDOM%_%RANDOM%.txt"

py -0p > "%PY_LIST_FILE%" 2>nul
if exist "%PY_LIST_FILE%" (
    findstr /C:"-V:3.12" "%PY_LIST_FILE%" >nul 2>&1 && (
        set "PYTHON_CMD=py"
        set "PYTHON_ARG=-3.12"
    )
    if not defined PYTHON_CMD (
        findstr /C:"-V:3.11" "%PY_LIST_FILE%" >nul 2>&1 && (
            set "PYTHON_CMD=py"
            set "PYTHON_ARG=-3.11"
        )
    )
    if not defined PYTHON_CMD (
        findstr /C:"-V:3.10" "%PY_LIST_FILE%" >nul 2>&1 && (
            set "PYTHON_CMD=py"
            set "PYTHON_ARG=-3.10"
        )
    )
    del "%PY_LIST_FILE%" >nul 2>&1
)

if not defined PYTHON_CMD (
    python -c "import sys; exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo [错误] 未找到受支持的 Python，请安装 Python 3.10、3.11 或 3.12。
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

if defined PYTHON_ARG (
    echo [信息] 使用 Python 启动器: %PYTHON_CMD% %PYTHON_ARG%
) else (
    echo [信息] 使用 Python 启动器: %PYTHON_CMD%
)
echo.
exit /b 0

:ensure_backend_env
if exist "%BACKEND_PYTHON%" (
    echo [信息] 后端虚拟环境已存在。
    exit /b 0
)

echo [信息] 正在创建后端虚拟环境: %BACKEND_ENV%
if defined PYTHON_ARG (
    %PYTHON_CMD% %PYTHON_ARG% -m venv "%BACKEND_ENV%"
) else (
    %PYTHON_CMD% -m venv "%BACKEND_ENV%"
)
if errorlevel 1 (
    echo [错误] 创建后端虚拟环境失败。
    pause
    exit /b 1
)

echo [信息] 正在安装后端依赖...
"%BACKEND_PYTHON%" -m pip install -r "%PROJECT_DIR%\server\requirements.txt"
if errorlevel 1 (
    echo [错误] 安装后端依赖失败。
    pause
    exit /b 1
)

if exist "%PROJECT_DIR%\mcp_server\elderly_mcp\requirements.txt" (
    echo [信息] 正在安装 MCP 依赖...
    "%BACKEND_PYTHON%" -m pip install -r "%PROJECT_DIR%\mcp_server\elderly_mcp\requirements.txt"
    if errorlevel 1 (
        echo [错误] 安装 MCP 依赖失败。
        pause
        exit /b 1
    )
)

echo [信息] 后端环境已就绪。
echo.
exit /b 0

:select_mode
echo ========================================
echo        OfficeEcho 一键启动系统
echo ========================================
echo.
echo 请选择启动模式:
echo.
echo   1) 开发模式 ^(dev^)  - 启动 Vite 开发服务器，支持热重载
echo   2) 生产模式 ^(prod^) - 构建并启动 Electron 应用
echo   3) 帮助信息
echo   4) 退出
echo.
set /p "choice=请输入选项 [1-4]: "

if "%choice%"=="1" (
    set "MODE=dev"
) else if "%choice%"=="2" (
    set "MODE=prod"
) else if "%choice%"=="3" (
    call :show_help
    exit /b 0
) else if "%choice%"=="4" (
    echo 已退出。
    exit /b 0
) else (
    echo 无效选项，请输入 1-4。
    echo.
    goto select_mode
)
exit /b 0
