当本地完成项目开发或更新后，采用“本地构建 Docker 镜像 -> 推送到 Docker Hub -> 服务器拉取并通过 Docker Compose 启动”的方式部署。

一、凭据与环境变量管理

部署过程中涉及两类敏感信息：

运维级凭据：如 GitHub、Docker Hub、Cloudflare、SSH 等认证信息，供 Agent 执行 push、pull、登录服务器、配置域名等操作使用。统一保存在本地安全文件中，如 ~/Documents/env.env。该文件不得提交到 GitHub，也不得打包进镜像。
项目运行级环境变量：如各类大模型 API Key、数据库连接信息等，保存在项目目录下的 .env 中，用于容器运行时注入环境变量。该文件不得提交到 GitHub，并应加入 .gitignore 与 .dockerignore。

项目中建议额外维护一个 .env.example，仅保留变量名和示例值，提交到 GitHub，方便后续部署和变量核对。

二、项目文件要求

项目目录中至少应包含：

Dockerfile
docker-compose.yml / compose.yml
.dockerignore
.gitignore
.env.example

其中，.env 仅在本地和服务器部署目录中保存，不进入 Git，也不进入镜像构建上下文。

三、部署前检查

每次部署前确认：

本地代码已验证
git status 干净或改动明确
.env 未被纳入版本控制
.env 已加入 .gitignore 和 .dockerignore
docker compose 配置正确
镜像 tag 已规划，不只依赖 latest
如有数据卷、数据库或上传文件，已确认持久化目录与备份策略
四、标准部署流程
本地整理代码并提交到 GitHub
本地构建 Docker 镜像
为镜像打版本 tag，并推送到 Docker Hub
确保服务器部署目录中存在：
compose.yml
.env
必要的 nginx 配置
数据目录 / volume 目录
登录服务器，拉取最新镜像
使用 docker compose up -d 更新服务
检查容器状态、日志、健康检查接口和外部访问是否正常
五、域名与访问配置
1. 国外云服务器

对于有公网 IP 的国外云服务器，项目子域名由 Cloudflare 管理。一般流程为：

在 Cloudflare 新增 DNS 记录，指向服务器公网 IP
在服务器上通过 nginx 等反向代理接收 80/443 请求
将请求转发到 Docker 容器实际监听端口
配置 HTTPS 和访问验证（如有需要）
2. 家庭服务器

对于家庭服务器，依赖已安装的 cloudflared tunnel 暴露服务。一般流程为：

在 Cloudflare Tunnel 中新增对应子域名的 hostname
将该子域名映射到家庭服务器本地服务地址
必要时通过 nginx 统一转发到不同容器
如需访问控制，再额外配置 Cloudflare Access Application
六、部署后验证

部署完成后必须检查：

容器是否成功启动
日志是否正常
域名是否能访问
环境变量是否正确注入
核心功能是否可用
七、版本与回滚

部署时应保留明确版本 tag。若新版本异常，应能够快速切回上一版本镜像。重要配置修改前，建议备份 compose 文件、nginx 配置和关键数据目录。

八、GitHub 回写原则

部署过程中新增的通用文件，如 Dockerfile、compose 文件、nginx 配置模板、部署脚本、.env.example 和文档，应及时整理并提交到 GitHub。任何真实密钥、token、.env 文件和本地运维凭据不得提交。