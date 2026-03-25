const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('[配置错误] 未设置 DEEPSEEK_API_KEY 环境变量，请在项目根目录的 .env 文件中配置。');
}

// Brave Search API 配置
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
if (!BRAVE_SEARCH_API_KEY) {
  console.error('[配置错误] 未设置 BRAVE_SEARCH_API_KEY 环境变量，请在项目根目录的 .env 文件中配置。');
}
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/v1/models';
const DEFAULT_MODEL = 'deepseek-chat';

// 可用的模型列表
const AVAILABLE_MODELS = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '通用对话模型' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '推理增强模型' }
];

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 存储每个会话的聊天历史
const chatHistories = new Map();

// API路由：获取可用模型列表
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// 联网搜索功能（使用 Brave Search API）
async function searchWeb(query, maxResults = 5) {
  try {
    if (!BRAVE_SEARCH_API_KEY) {
      console.error('[搜索] 未配置 BRAVE_SEARCH_API_KEY');
      return searchWebFallback(query, maxResults);
    }

    const params = new URLSearchParams({
      q: query,
      count: String(maxResults),
      search_lang: 'zh-hans',
      text_decorations: 'false'
    });

    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_SEARCH_API_KEY
      }
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Brave Search API 返回 ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const webResults = data.web?.results || [];

    if (webResults.length === 0) {
      console.log('[搜索] Brave Search 未返回结果');
      return searchWebFallback(query, maxResults);
    }

    let results = webResults.slice(0, maxResults).map(r => ({
      title: r.title || '无标题',
      url: r.url || '',
      snippet: r.description || ''
    }));

    if (results.length > 0) {
      const contentPromises = results.slice(0, Math.min(3, results.length)).map(result =>
        fetchWebPageContent(result.url).catch(() => null)
      );
      const contents = await Promise.all(contentPromises);
      contents.forEach((content, index) => {
        if (content && results[index] && content.length > (results[index].snippet || '').length) {
          results[index].snippet = content.substring(0, 1000);
          results[index].fullContent = content;
        }
      });
    }

    console.log(`[搜索] Brave Search 找到 ${results.length} 个结果`);
    return results;
  } catch (err) {
    console.error('[搜索] Brave Search 请求失败:', err.message);
    return searchWebFallback(query, maxResults);
  }
}

// 备用搜索方法：API 不可用时返回可点击的搜索链接
async function searchWebFallback(query, maxResults = 5) {
  const encodedQuery = encodeURIComponent(query);
  return [{
    title: `搜索"${query}"`,
    url: `https://search.brave.com/search?q=${encodedQuery}`,
    snippet: `未能通过 Brave Search API 获取搜索结果。请检查 BRAVE_SEARCH_API_KEY 是否正确配置，然后点击链接在浏览器中查看关于"${query}"的搜索结果。`
  }];
}

// 获取网页内容
function fetchWebPageContent(url) {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith('http')) {
      reject(new Error('无效的URL'));
      return;
    }
    
    // 根据URL协议选择http或https模块
    const httpModule = url.startsWith('https') ? https : http;
    
    httpModule.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 8000
    }, (res) => {
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return fetchWebPageContent(redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href)
            .then(resolve)
            .catch(reject);
        }
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => { 
        data += chunk.toString('utf8');
        // 限制读取大小，避免内存问题
        if (data.length > 500000) { // 500KB限制
          res.destroy();
          resolve(extractTextContent(data));
        }
      });
      
      res.on('end', () => {
        try {
          const content = extractTextContent(data);
          resolve(content);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject).on('timeout', () => {
      reject(new Error('获取网页内容超时'));
    });
  });
}

// 从HTML中提取文本内容
function extractTextContent(html) {
  // 移除script和style标签
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // 提取主要文本内容
  // 尝试提取article、main、content等主要内容区域
  const contentPatterns = [
    /<article[\s\S]*?>([\s\S]*?)<\/article>/i,
    /<main[\s\S]*?>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*content[^"]*"[\s\S]*?>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[\s\S]*?>([\s\S]*?)<\/div>/i,
    /<body[\s\S]*?>([\s\S]*?)<\/body>/i
  ];
  
  let content = '';
  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      content = match[1];
      break;
    }
  }
  
  // 如果没有找到特定区域，使用整个body
  if (!content) {
    const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : html;
  }
  
  // 移除HTML标签
  content = content.replace(/<[^>]+>/g, ' ');
  
  // 清理空白字符
  content = content.replace(/\s+/g, ' ').trim();
  
  // 限制长度
  if (content.length > 3000) {
    content = content.substring(0, 3000) + '...';
  }
  
  return content;
}

// API路由：联网搜索
app.post('/api/search', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: '搜索查询不能为空' });
    }
    
    console.log(`[搜索] 查询: ${query}`);
    const results = await searchWeb(query, maxResults);
    console.log(`[搜索] 找到 ${results.length} 个结果`);
    
    res.json({ results });
  } catch (error) {
    console.error('搜索错误:', error);
    res.status(500).json({ error: '搜索失败: ' + error.message });
  }
});

// API路由：发送消息
app.post('/api/chat', async (req, res) => {
  try {
    console.log(`[聊天] 收到请求 - body:`, JSON.stringify({
      message: req.body.message?.substring(0, 50),
      sessionId: req.body.sessionId,
      model: req.body.model,
      enableSearch: req.body.enableSearch
    }));
    
    const { message, sessionId, model, enableSearch = false } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // 获取或创建会话历史
    if (!chatHistories.has(sessionId)) {
      chatHistories.set(sessionId, []);
    }
    const history = chatHistories.get(sessionId);

    let finalMessage = message;
    let searchResults = null;

    // 如果启用了搜索功能，先进行联网搜索
    console.log(`[聊天] 检查搜索状态 - enableSearch: ${enableSearch}, 类型: ${typeof enableSearch}`);
    if (enableSearch) {
      try {
        console.log(`[聊天] ✅ 启用联网搜索，查询: ${message}`);
        searchResults = await searchWeb(message, 5);
        console.log(`[聊天] 搜索完成，返回结果类型: ${typeof searchResults}, 是否为数组: ${Array.isArray(searchResults)}`);
        
        // 确保 searchResults 是数组
        if (!Array.isArray(searchResults)) {
          console.log(`[聊天] ⚠️ 搜索结果不是数组，转换为空数组`);
          searchResults = [];
        }
        
        console.log(`[聊天] 搜索结果数量: ${searchResults.length}`);
        if (searchResults.length > 0) {
          console.log(`[聊天] 搜索结果示例:`, JSON.stringify(searchResults[0], null, 2));
          
          // 构建搜索结果的上下文，优先使用完整内容
          const searchContext = searchResults.map((result, index) => {
            // 优先使用fullContent，如果没有则使用snippet
            const content = result.fullContent || result.snippet || '';
            const contentPreview = content.length > 500 ? content.substring(0, 500) + '...' : content;
            return `[${index + 1}] ${result.title || '无标题'}\n${contentPreview}\n来源: ${result.url || '未知'}`;
          }).join('\n\n');
          
          // 将搜索结果添加到消息中
          finalMessage = `用户问题：${message}\n\n以下是联网搜索到的相关信息：\n\n${searchContext}\n\n请基于以上搜索结果回答用户的问题。如果搜索结果中没有相关信息，请基于你的知识回答。`;
          
          console.log(`[聊天] ✅ 搜索到 ${searchResults.length} 个结果，已添加到上下文`);
          console.log(`[聊天] 上下文长度: ${finalMessage.length} 字符`);
        } else {
          console.log(`[聊天] ⚠️ 未找到搜索结果，使用原始消息`);
          searchResults = []; // 确保是空数组而不是null
        }
      } catch (searchError) {
        console.error('[聊天] ❌ 搜索失败，继续使用原始消息:', searchError);
        console.error('[聊天] 搜索错误堆栈:', searchError.stack);
        // 搜索失败时设置为空数组
        searchResults = [];
      }
    } else {
      console.log(`[聊天] ⚠️ 搜索功能未启用，跳过搜索`);
    }

    // 添加用户消息到历史（使用原始消息，不包含搜索结果）
    history.push({ role: 'user', content: message });

    // 构建消息数组（DeepSeek 使用 OpenAI 兼容格式）
    // 如果启用了搜索，使用包含搜索结果的最终消息
    const messages = history.map((msg, index) => {
      // 最后一条用户消息使用包含搜索结果的消息
      if (index === history.length - 1 && enableSearch && searchResults && searchResults.length > 0) {
        return {
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: finalMessage
        };
      }
      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      };
    });

    // 使用选择的模型或默认模型
    const selectedModel = model || DEFAULT_MODEL;
    
    // 验证模型是否可用
    const isValidModel = AVAILABLE_MODELS.some(m => m.id === selectedModel);
    if (!isValidModel) {
      return res.status(400).json({ error: `不支持的模型: ${selectedModel}` });
    }

    // 记录使用的模型（用于调试）
    console.log(`[API调用] 使用模型: ${selectedModel}, 请求模型参数: ${model}`);

    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: '未知错误' } }));
      const errorMessage = errorData.error?.message || response.statusText;
      
      // 提供更友好的错误信息
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Insufficient Balance') || errorMessage.includes('余额不足')) {
        userFriendlyMessage = 'API 余额不足。请前往 DeepSeek 官网 (https://platform.deepseek.com) 充值账户余额。';
      } else if (errorMessage.includes('Invalid API Key') || errorMessage.includes('invalid')) {
        userFriendlyMessage = 'API Key 无效。请检查 API Key 是否正确。';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
        userFriendlyMessage = '请求频率过高，请稍后再试。';
      }
      
      console.error('DeepSeek API 错误:', errorMessage);
      throw new Error(userFriendlyMessage);
    }

    const data = await response.json();
    
    const apiMessage = data.choices[0]?.message;
    const aiResponse = apiMessage?.content;
    
    // 检查是否有推理过程（DeepSeek Reasoner 使用 reasoning_content 等字段）
    let reasoning = null;
    if (apiMessage?.reasoning_content) {
      reasoning = apiMessage.reasoning_content;
    } else if (data.choices[0]?.reasoning_content) {
      reasoning = data.choices[0].reasoning_content;
    } else if (data.choices[0]?.message?.reasoning_content) {
      reasoning = data.choices[0].message.reasoning_content;
    } else if (data.reasoning_content) {
      reasoning = data.reasoning_content;
    } else if (data.usage?.reasoning_tokens && data.usage.reasoning_tokens > 0) {
      const searchReasoningContent = (obj) => {
        if (typeof obj !== 'object' || obj === null) return null;
        if (obj.reasoning_content && typeof obj.reasoning_content === 'string') return obj.reasoning_content;
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            const result = searchReasoningContent(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };
      const foundReasoning = searchReasoningContent(data);
      if (foundReasoning) reasoning = foundReasoning;
    } else if (apiMessage?.reasoning) {
      reasoning = apiMessage.reasoning;
    } else if (aiResponse) {
      const reasoningPatterns = [
        /<think>([\s\S]*?)<\/think>/i,
        /<reasoning>([\s\S]*?)<\/reasoning>/i,
        /<think>([\s\S]*?)<\/redacted_reasoning>/i,
        /推理过程[：:]\s*([\s\S]*?)(?=\n\n|答案|Answer|$)/i,
        /Reasoning[：:]\s*([\s\S]*?)(?=\n\n|Answer|答案|$)/i,
        /思考过程[：:]\s*([\s\S]*?)(?=\n\n|答案|Answer|$)/i
      ];
      for (const pattern of reasoningPatterns) {
        const match = aiResponse.match(pattern);
        if (match && match[1]) {
          reasoning = match[1].trim();
          break;
        }
      }
      if (!reasoning && selectedModel === 'deepseek-reasoner') {
        const answerMarkers = ['答案：', 'Answer:', '结论：', 'Conclusion:', '因此', '所以', '综上'];
        let answerIndex = -1;
        for (const marker of answerMarkers) {
          const index = aiResponse.indexOf(marker);
          if (index > 0) { answerIndex = index; break; }
        }
        if (answerIndex > 50) reasoning = aiResponse.substring(0, answerIndex).trim();
      }
      if (!reasoning && selectedModel === 'deepseek-reasoner' && apiMessage) {
        for (const key in apiMessage) {
          if (key.toLowerCase().includes('reason') || key.toLowerCase().includes('think')) {
            if (typeof apiMessage[key] === 'string' && apiMessage[key].length > 50) {
              reasoning = apiMessage[key];
              break;
            }
          }
        }
      }
    }

    if (!aiResponse) {
      throw new Error('未收到有效的AI响应');
    }

    // 添加AI响应到历史（包含推理过程）
    history.push({ 
      role: 'assistant', 
      content: aiResponse,
      reasoning: reasoning || undefined
    });

    // 限制历史记录长度（保留最近20轮对话）
    if (history.length > 40) {
      history.splice(0, history.length - 40);
    }

    // 返回响应、推理过程、搜索结果和使用的模型信息
    // 如果启用了搜索，返回搜索结果（即使是空数组也要返回，以便前端知道搜索已执行）
    const responseData = { 
      response: aiResponse,
      reasoning: reasoning || null,
      model: selectedModel // 返回实际使用的模型
    };
    
    // 如果前端请求了搜索（enableSearch为true），总是返回searchResults字段
    // 即使搜索失败或没有结果，也返回空数组，这样前端就知道搜索已执行
    if (enableSearch) {
      // 确保 searchResults 是数组
      const finalSearchResults = searchResults && Array.isArray(searchResults) ? searchResults : [];
      responseData.searchResults = finalSearchResults;
      console.log(`[聊天] 返回响应 - enableSearch: ${enableSearch}, searchResults数量: ${finalSearchResults.length}`);
      if (finalSearchResults.length > 0) {
        console.log(`[聊天] 搜索结果示例:`, JSON.stringify(finalSearchResults[0], null, 2));
      } else {
        console.log(`[聊天] ⚠️ 搜索结果为空，但仍返回空数组给前端`);
      }
    } else {
      console.log(`[聊天] 返回响应 - enableSearch: ${enableSearch}, 未启用搜索，不返回searchResults字段`);
    }
    
    console.log(`[聊天] 最终返回数据包含字段:`, Object.keys(responseData));
    res.json(responseData);
  } catch (error) {
    console.error('Error:', error);
    
    // 根据错误类型返回适当的 HTTP 状态码
    let statusCode = 500;
    if (error.message.includes('余额不足') || error.message.includes('Insufficient Balance')) {
      statusCode = 402; // Payment Required
    } else if (error.message.includes('无效') || error.message.includes('Invalid')) {
      statusCode = 401; // Unauthorized
    }
    
    res.status(statusCode).json({ 
      error: error.message,
      details: '如果问题持续存在，请检查：\n1. API Key 是否有效\n2. 账户余额是否充足\n3. 网络连接是否正常'
    });
  }
});

// API路由：清除会话历史
app.post('/api/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && chatHistories.has(sessionId)) {
    chatHistories.delete(sessionId);
  }
  res.json({ success: true });
});

// API路由：编辑历史记录
app.post('/api/history/edit', (req, res) => {
  try {
    const { sessionId, editIndex, newContent } = req.body;
    
    if (!chatHistories.has(sessionId)) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    const history = chatHistories.get(sessionId);
    
    // 找到对应的用户消息（用户消息在偶数索引，AI回复在奇数索引）
    let userMessageIndex = -1;
    let userCount = 0;
    
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === 'user') {
        if (userCount === editIndex) {
          userMessageIndex = i;
          break;
        }
        userCount++;
      }
    }
    
    if (userMessageIndex === -1) {
      return res.status(404).json({ error: '消息不存在' });
    }
    
    // 更新消息内容
    history[userMessageIndex].content = newContent;
    
    // 删除该消息之后的所有消息（包括对应的AI回复）
    const messagesToDelete = history.length - userMessageIndex - 1;
    history.splice(userMessageIndex + 1, messagesToDelete);
    
    res.json({ success: true });
  } catch (error) {
    console.error('编辑历史错误:', error);
    res.status(500).json({ error: '编辑历史失败' });
  }
});


// 提供前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
