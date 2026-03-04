FROM node:20-slim

# 安装 Python3 和 ddgs 库，用于搜索脚本
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install --break-system-packages --no-cache-dir ddgs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package*.json ./

RUN npm install --production

# 再复制项目代码
COPY . .

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# 在容器内用 Node 直接启动
CMD ["node", "server.js"]

