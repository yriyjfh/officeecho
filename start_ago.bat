@echo off
chcp 65001 >nul
echo ======================================
echo        启动 摄像头端（学生端）
echo ======================================

cd /d D:\Fay_man\officeecho
npm run dev:visitor

pause