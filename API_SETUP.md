# API 配置说明

## DeepSeek API 余额不足问题

如果遇到 "Insufficient Balance" 错误，说明 API 账户余额不足。

### 解决方案

1. **充值账户**
   - 访问 [DeepSeek 平台](https://platform.deepseek.com)
   - 登录您的账户
   - 充值账户余额

2. **使用其他 API 提供商**
   - 本项目支持 OpenAI 兼容的 API
   - 可以切换到其他提供商，如：
     - OpenAI
     - 其他支持 OpenAI 格式的 API

## 如何更换 API Key（推荐使用环境变量）

为了更好的安全性，**不要在 `server.js` 中直接写死 API Key**，而是使用环境变量。

1. 在项目根目录创建或编辑 `.env` 文件，设置新的 Key：
   ```
   DEEPSEEK_API_KEY=your-api-key-here
   ```

2. 项目已安装 `dotenv`，并在 `server.js` 中加载环境变量，核心代码类似：
   ```javascript
   require('dotenv').config();
   const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
   ```

3. 确保 `.env` 文件已添加到 `.gitignore` 中（本项目已默认忽略 `.env`）

4. 修改 `.env` 中的 `DEEPSEEK_API_KEY` 后，重启服务即可生效，无需修改 `server.js` 源码。

## 获取 DeepSeek API Key

1. 访问 [DeepSeek 平台](https://platform.deepseek.com)
2. 注册/登录账户
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制并保存（只显示一次）

## 联网搜索（DuckDuckGo）

联网功能使用 DuckDuckGo 搜索。在中国大陆需配置网络代理才能访问。

### 配置代理

启动服务前设置环境变量：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890   # 替换为你的代理地址
export HTTP_PROXY=http://127.0.0.1:7890
npm start
```

或在 `.env` 文件中添加（需在 server.js 中加载）：

```
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

### 备用方案

若 DuckDuckGo 不可用，将返回可点击的搜索链接，用户可在浏览器中手动查看结果。

## 注意事项

- API Key 是敏感信息，不要提交到公共代码仓库
- 定期检查账户余额
- 注意 API 使用限制和费率
