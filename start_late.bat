@echo off
chcp 65001 >nul
echo ======================================
echo        启动 后端 + 管理端
echo ======================================

:: 启动后端 - 使用 conda
start "后端服务" cmd /k "call conda activate officeecho_env && cd /d D:\Fay_man\officeecho\server && python app.py"

:: 注意：需要在弹出的窗口中手动验证
echo 1. 后端服务已启动，请查看弹出的命令行窗口...
echo    如果看到 "Running on http://127.0.0.1:8000" 表示成功
echo.

timeout /t 5 /nobreak >nul

echo 2. 检查后端状态...
curl -s http://127.0.0.1:8000/health >nul
if errorlevel 1 (
    echo ❌ 后端启动失败
) else (
    echo ✅ 后端正常: http://localhost:8000/health
)

timeout /t 2 /nobreak >nul

echo 3. 启动管理端前端...
start "管理端前端" cmd /k "cd /d D:\Fay_man\officeecho && npm run dev:admin"

timeout /t 5 /nobreak >nul

echo 4. 检查管理端状态...
netstat -ano | findstr :3001 >nul
if errorlevel 1 (
    echo ❌ 管理端启动失败
) else (
    echo ✅ 管理端正常: http://localhost:3001/admin.html
)

echo.
pause