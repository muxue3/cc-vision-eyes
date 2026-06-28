@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem ============================================================
rem  cc-vision-eyes 启动脚本（Windows）
rem  先后台拉起视觉代理，再启动 Claude Code 指向代理
rem  首次使用：把 config.example.json 复制成 config.json 并填好 key
rem ============================================================
if not exist "%~dp0config.json" (
  echo [!] 还没有 config.json，请先复制 config.example.json 为 config.json 并填写 key
  pause
  exit /b 1
)
start "cc-vision-eyes" /min node "%~dp0proxy.js"
timeout /t 2 >nul
set ANTHROPIC_BASE_URL=http://127.0.0.1:8788
set ANTHROPIC_API_KEY=dummy-proxy-injects-real-key
echo ============================================================
echo  cc-vision-eyes  ^|  大脑=你的主力模型  +  眼睛=视觉模型（自动识图）
echo  视觉代理: http://127.0.0.1:8788
echo  直接粘贴图片 或 让它读图片文件 即可，自动识别
echo ============================================================
rem 如需指定模型名，可改下面这行，例如： claude --model glm-5.2 %*
claude %*
pause
