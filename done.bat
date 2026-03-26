@echo off
chcp 65001 >nul
setlocal

set "URL=http://192.168.1.26:5000/transparent-pass"
rem 使用UTF-8编码的中文消息
set "BODY={\"user\":\"User\",\"text\":\"office echo completed\"}"

curl.exe -s -X POST "%URL%" ^
  -H "Content-Type: application/json" ^
  --data-raw "%BODY%" >nul

if errorlevel 1 (
  echo [done.bat] Request failed.
  exit /b 1
)

echo [done.bat] Notification sent.
exit /b 0
