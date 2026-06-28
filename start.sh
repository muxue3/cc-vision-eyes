#!/usr/bin/env bash
# ============================================================
#  cc-vision-eyes 启动脚本（macOS / Linux）
#  先后台拉起视觉代理，再启动 Claude Code 指向代理
#  首次使用：cp config.example.json config.json 并填好 key
# ============================================================
cd "$(dirname "$0")" || exit 1

if [ ! -f ./config.json ]; then
  echo "[!] 还没有 config.json，请先 cp config.example.json config.json 并填写 key"
  exit 1
fi

node ./proxy.js &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null' EXIT
sleep 2

export ANTHROPIC_BASE_URL="http://127.0.0.1:8788"
export ANTHROPIC_API_KEY="dummy-proxy-injects-real-key"
echo "============================================================"
echo " cc-vision-eyes | 大脑=你的主力模型 + 眼睛=视觉模型（自动识图）"
echo " 视觉代理: http://127.0.0.1:8788"
echo "============================================================"
# 如需指定模型名： claude --model glm-5.2 "$@"
claude "$@"
