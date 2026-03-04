# ChatGPT Clone - DeepSeek AI 版本

一个基于 DeepSeek AI 的 ChatGPT 克隆版网页应用。

## 功能特点

- 🎨 现代化的用户界面，类似 ChatGPT
- 💬 流畅的对话体验
- 🧠 基于 DeepSeek Chat 模型
- 💾 会话历史管理
- 📱 响应式设计，支持移动端

## 安装步骤

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动服务器**
   ```bash
   npm start
   ```

3. **访问应用**
   打开浏览器访问: http://localhost:3000

## 项目结构

```
克隆chatbot/
├── server.js          # Express 后端服务器
├── package.json       # 项目依赖配置
├── public/            # 前端文件
│   ├── index.html    # 主页面
│   ├── styles.css    # 样式文件
│   └── script.js     # 前端逻辑
└── README.md         # 项目说明
```

## 技术栈

- **后端**: Node.js + Express
- **前端**: HTML + CSS + JavaScript
- **AI模型**: DeepSeek Chat
- **API**: DeepSeek API (OpenAI 兼容接口)

## 使用说明

1. 在输入框中输入你的问题或消息
2. 按 Enter 键或点击发送按钮发送消息
3. 按 Shift + Enter 可以换行
4. 点击"新对话"按钮可以开始新的对话

## API 端点

- `POST /api/chat` - 发送消息并获取AI响应
- `POST /api/clear` - 清除当前会话历史

## 注意事项

- API Key 已配置在服务器代码中
- 会话历史存储在服务器内存中，重启服务器后会丢失
- 建议在生产环境中使用环境变量管理 API Key

## 许可证

MIT
