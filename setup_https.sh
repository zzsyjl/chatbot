#!/bin/bash
# 在服务器上配置 HTTPS（yjl.app）
# 用法：先部署项目，然后 SSH 到服务器执行：
#   cd /opt/chatbot && sudo bash setup_https.sh
#
# 前置条件：
#   1. 域名 yjl.app 已添加 A 记录指向本机 IP（80.251.213.203）
#   2. DNS 已生效（可用 nslookup yjl.app 验证）

set -e
DOMAIN="yjl.app"
APP_DIR="/opt/chatbot"

# 根据系统选择 Nginx 配置目录：
# - Debian/Ubuntu: /etc/nginx/sites-available + sites-enabled
# - RHEL/Rocky/CentOS: /etc/nginx/conf.d
if [ -d /etc/nginx/sites-available ]; then
  NGINX_CONF="/etc/nginx/sites-available/chatbot"
  NGINX_USE_SITES=1
else
  NGINX_CONF="/etc/nginx/conf.d/chatbot.conf"
  NGINX_USE_SITES=0
fi

echo "==> 检查 root 权限..."
[ "$(id -u)" -eq 0 ] || { echo "请使用 sudo 运行此脚本"; exit 1; }

echo "==> 安装 Nginx..."
# 兼容 Debian/Ubuntu (apt)、RHEL/CentOS/Alma (yum/dnf)
if command -v apt-get &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq nginx
elif command -v dnf &>/dev/null; then
  dnf install -y nginx
elif command -v yum &>/dev/null; then
  yum install -y nginx
else
  echo "未找到受支持的包管理器用于安装 Nginx，请手动安装后重试。"
  exit 1
fi

echo "==> 创建 Certbot ACME 目录..."
mkdir -p /var/www/certbot
if id www-data &>/dev/null; then
  chown -R www-data:www-data /var/www/certbot
elif id nginx &>/dev/null; then
  chown -R nginx:nginx /var/www/certbot
else
  echo "警告：未找到 www-data 或 nginx 用户，跳过目录所有者修改。"
fi

echo "==> 安装 Certbot（Let's Encrypt）..."
if command -v apt-get &>/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx
elif command -v dnf &>/dev/null; then
  # Rocky/RHEL 系列：使用 python3-pip 安装 certbot
  dnf install -y epel-release || true
  dnf install -y python3 python3-pip
  pip3 install --upgrade pip
  pip3 install certbot certbot-nginx
  # 确保 certbot 在 PATH 中
  if [ -x /usr/local/bin/certbot ] && [ ! -x /usr/bin/certbot ]; then
    ln -s /usr/local/bin/certbot /usr/bin/certbot
  fi
elif command -v yum &>/dev/null; then
  yum install -y epel-release || true
  yum install -y python3 python3-pip
  pip3 install --upgrade pip
  pip3 install certbot certbot-nginx
  if [ -x /usr/local/bin/certbot ] && [ ! -x /usr/bin/certbot ]; then
    ln -s /usr/local/bin/certbot /usr/bin/certbot
  fi
else
  echo "未找到受支持的包管理器用于安装 Certbot，请手动安装后重试。"
  exit 1
fi

echo "==> 复制 Nginx 配置..."
cp "$APP_DIR/nginx-chatbot.conf" "$NGINX_CONF"

if [ "$NGINX_USE_SITES" -eq 1 ]; then
  # Debian/Ubuntu 风格：使用 sites-enabled
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/chatbot
  # 移除默认站点（避免冲突）
  rm -f /etc/nginx/sites-enabled/default
fi

echo "==> 测试 Nginx 配置..."
nginx -t

echo "==> 启动/重载 Nginx..."
systemctl enable nginx
systemctl restart nginx

echo "==> 申请 SSL 证书（Let's Encrypt）..."
echo "    请确保域名 yjl.app 已解析到本机 IP，否则会失败。"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" --redirect

echo ""
echo "==> HTTPS 配置完成！"
echo "    访问地址：https://$DOMAIN"
echo "    证书会自动续期（Certbot 已配置 cron）"
