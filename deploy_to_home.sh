#!/bin/bash
# 部署 chatbot Docker 到家庭服务器（SSH 配置中的 Host，默认 yyhome）
# 用法: ./deploy_to_home.sh
# 可选环境变量:
#   DEPLOY_SSH_HOST=yyhome
#   DEPLOY_REMOTE_DIR=/path/on/server   （不设则使用 远程用户主目录/chatbot）
set -e

SSH_HOST="${DEPLOY_SSH_HOST:-yyhome}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -n "${DEPLOY_REMOTE_DIR:-}" ]; then
  REMOTE_DIR="$DEPLOY_REMOTE_DIR"
else
  echo "==> 探测 ${SSH_HOST} 上的主目录..."
  REMOTE_DIR="$(ssh "$SSH_HOST" 'echo $HOME')/chatbot"
fi

echo "==> 目标: ${SSH_HOST}:${REMOTE_DIR}"

echo "==> [1/4] 同步项目文件..."
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

echo "==> [2/4] 同步 .env ..."
rsync -avz -e "ssh" "${SCRIPT_DIR}/.env" "${SSH_HOST}:${REMOTE_DIR}/.env"

echo "==> [3/4] 远程构建并启动容器..."
ssh "$SSH_HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE_SCRIPT'
set -e
cd "$1"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误: 未找到 docker，请先在家庭服务器安装 Docker Engine 与 compose 插件。"
  echo "参考: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "错误: 未找到 docker compose 插件，请安装 docker-compose-plugin。"
  exit 1
fi

docker compose down 2>/dev/null || true
echo "==> 构建镜像..."
docker compose build --no-cache
echo "==> 启动容器..."
docker compose up -d

echo ""
echo "==> 容器状态:"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")
echo "==> 本机 http://127.0.0.1:3000/ => HTTP $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  docker compose logs --tail=30
fi
REMOTE_SCRIPT

echo ""
echo "==> [4/4] 部署完成。"
echo ""
echo "━━━━━━━━ Cloudflare Tunnel：子域名 llm-compare.yjl.app ━━━━━━━━"
echo "（需在 Cloudflare 控制台与家庭服务器 cloudflared 上各操作一次）"
echo ""
echo "1) 若已有 Tunnel：在 Zero Trust → Networks → Tunnels → 你的隧道 → Public Hostname"
echo "   新增："
echo "     Subdomain: llm-compare    Domain: yjl.app"
echo "     Type: HTTP   URL: http://127.0.0.1:3000"
echo ""
echo "2) 若没有 Tunnel：在家庭服务器执行"
echo "     cloudflared tunnel login"
echo "     cloudflared tunnel create llm-compare-home"
echo "   记下隧道 ID，将仓库内 cloudflared/config-llm-compare.example.yml 中"
echo "   <TUNNEL-UUID> 替换后复制为 ~/.cloudflared/config.yml（或与现有 ingress 合并）。"
echo ""
echo "     cloudflared service install   # 或手动: cloudflared tunnel run <名称或UUID>"
echo ""
echo "3) DNS：在 Public Hostname 保存后，Cloudflare 通常会写入 CNAME；"
echo "   若提示手动添加，请把 llm-compare 指向 <隧道ID>.cfargotunnel.com"
echo ""
echo "完成后访问: https://llm-compare.yjl.app"
echo "（DNS 建议：llm-compare 橙云 CNAME → chat.yjl.app，避免部分网络直连 cfargotunnel 异常）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
