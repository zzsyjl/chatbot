#!/bin/bash
# 部署 chatbot Docker 到 proxy 服务器 (yjl.app)
# 用法: chmod +x deploy_to_proxy.sh && ./deploy_to_proxy.sh
set -e

SSH_HOST="root@80.251.213.203"
REMOTE_DIR="/opt/chatbot"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> [1/5] 同步项目文件到 ${SSH_HOST}:${REMOTE_DIR} ..."
rsync -avz --delete \
  -e "ssh" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.playwright-mcp' \
  --exclude '*.log' \
  --exclude 'test-result.png' \
  --exclude 'three-column-layout.png' \
  --exclude 'three-models-working.png' \
  "${SCRIPT_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

echo "==> [2/5] 同步 .env 文件（包含 API Key）..."
rsync -avz -e "ssh" "${SCRIPT_DIR}/.env" "${SSH_HOST}:${REMOTE_DIR}/.env"

echo "==> [3/5] 在远程服务器上执行部署..."
ssh "${SSH_HOST}" "bash -s" << 'REMOTE_SCRIPT'
set -e
REMOTE_DIR="/opt/chatbot"
cd "${REMOTE_DIR}"

# --- 安装 Docker ---
if ! command -v docker >/dev/null 2>&1; then
  echo "==> 安装 Docker (Rocky Linux 9)..."
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "==> Docker 安装完成"
elif ! systemctl is-active --quiet docker; then
  echo "==> 启动 Docker 服务..."
  systemctl enable docker
  systemctl start docker
fi

docker --version
docker compose version

# --- 停止旧的 Node.js 直接运行进程 ---
OLD_PID=$(pgrep -f "node.*chatbot/server.js" || true)
if [ -n "$OLD_PID" ]; then
  echo "==> 停止旧的 Node.js 进程 (PID: $OLD_PID)..."
  kill $OLD_PID 2>/dev/null || true
  sleep 2
  kill -9 $OLD_PID 2>/dev/null || true
  echo "==> 旧进程已停止"
fi

# --- 停止旧的 Docker 容器（如果有） ---
docker compose down 2>/dev/null || true

# --- 构建并启动容器 ---
echo "==> 构建 Docker 镜像..."
docker compose build --no-cache

echo "==> 启动容器..."
docker compose up -d

echo ""
echo "==> 容器状态:"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

echo ""
echo "==> 等待服务启动..."
sleep 3

echo "==> 检查服务健康状态..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "==> 服务正常运行! (HTTP $HTTP_CODE)"
else
  echo "==> 警告: 服务返回 HTTP $HTTP_CODE，查看日志:"
  docker compose logs --tail=20
fi

REMOTE_SCRIPT

echo ""
echo "==> [4/5] 验证外部访问..."
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://yjl.app/ 2>/dev/null || echo "000")
echo "==> https://yjl.app/ 返回 HTTP $HTTP_CODE"

echo ""
echo "==> [5/5] 部署完成!"
echo "    访问地址: https://yjl.app"
