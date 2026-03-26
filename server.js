const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const INFRON_API_KEY = process.env.INFRON_API_KEY;
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const INFRON_API_URL = 'https://llm.onerouter.pro/v1/chat/completions';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

const PROVIDER_MODELS = {
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '通用对话模型' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '推理增强模型' }
  ],
  openai: [
    { id: 'gpt-5.4', name: 'GPT-5.4', description: '最新旗舰模型' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '上一代旗舰' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '轻量高效' }
  ],
  anthropic: [
    { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', description: '最强编程与推理' },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: '平衡模型' },
    { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: '快速轻量' }
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '谷歌旗舰模型' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '快速高效' }
  ],
  minimax: [
    { id: 'minimax-01', name: 'MiniMax-01', description: 'MiniMax 旗舰模型' }
  ],
  zhipu: [
    { id: 'glm-4-plus', name: 'GLM-4-Plus', description: '智谱旗舰模型' },
    { id: 'glm-4-flash', name: 'GLM-4-Flash', description: '智谱快速模型' }
  ],
  qwen: [
    { id: 'qwen-max', name: 'Qwen-Max', description: '通义千问旗舰' },
    { id: 'qwen-plus', name: 'Qwen-Plus', description: '通义千问增强' }
  ]
};

const PROVIDER_NAMES = {
  deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic',
  google: 'Google', minimax: 'MiniMax', zhipu: '智谱GLM', qwen: '通义千问'
};

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

// ─── API: 模型列表 ───
app.get('/api/models', (req, res) => {
  const providers = {};
  for (const [key, models] of Object.entries(PROVIDER_MODELS)) {
    let available = false;
    if (key === 'deepseek') available = !!DEEPSEEK_API_KEY;
    else available = !!INFRON_API_KEY;
    providers[key] = { name: PROVIDER_NAMES[key], models, available };
  }
  res.json({ providers });
});

// ─── LLM 调用函数 ───
async function callDeepSeek(messages, model) {
  if (!DEEPSEEK_API_KEY) throw new Error('未配置 DEEPSEEK_API_KEY');
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, stream: false })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `DeepSeek API 错误 ${res.status}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return { content: msg?.content || '', reasoning: msg?.reasoning_content || null };
}

async function callInfron(messages, model) {
  if (!INFRON_API_KEY) throw new Error('未配置 INFRON_API_KEY');
  const res = await fetch(INFRON_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INFRON_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, stream: false })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Infron API 错误 ${res.status}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return { content: msg?.content || '', reasoning: msg?.reasoning_content || msg?.reasoning || null };
}

function callProvider(provider, messages, model) {
  if (provider === 'deepseek') return callDeepSeek(messages, model);
  return callInfron(messages, model);
}

// ─── 联网搜索 ───
async function searchWeb(query, maxResults = 5) {
  try {
    if (!BRAVE_SEARCH_API_KEY) return searchWebFallback(query);
    const params = new URLSearchParams({ q: query, count: String(maxResults), search_lang: 'zh-hans', text_decorations: 'false' });
    const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': BRAVE_SEARCH_API_KEY }
    });
    if (!res.ok) throw new Error(`Brave Search API 返回 ${res.status}`);
    const data = await res.json();
    const webResults = data.web?.results || [];
    if (webResults.length === 0) return searchWebFallback(query);

    let results = webResults.slice(0, maxResults).map(r => ({
      title: r.title || '无标题', url: r.url || '', snippet: r.description || ''
    }));

    const contentPromises = results.slice(0, 3).map(r => fetchWebPageContent(r.url).catch(() => null));
    const contents = await Promise.all(contentPromises);
    contents.forEach((content, i) => {
      if (content && results[i] && content.length > (results[i].snippet || '').length) {
        results[i].snippet = content.substring(0, 1000);
        results[i].fullContent = content;
      }
    });

    return results;
  } catch (err) {
    console.error('[搜索] 失败:', err.message);
    return searchWebFallback(query);
  }
}

async function searchWebFallback(query) {
  return [{ title: `搜索"${query}"`, url: `https://search.brave.com/search?q=${encodeURIComponent(query)}`, snippet: '未能获取搜索结果，请点击链接查看。' }];
}

function fetchWebPageContent(url) {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith('http')) return reject(new Error('无效URL'));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 8000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return fetchWebPageContent(loc.startsWith('http') ? loc : new URL(loc, url).href).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => { data += chunk.toString('utf8'); if (data.length > 500000) { res.destroy(); resolve(extractText(data)); } });
      res.on('end', () => resolve(extractText(data)));
    }).on('error', reject).on('timeout', () => reject(new Error('超时')));
  });
}

function extractText(html) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const patterns = [/<article[\s\S]*?>([\s\S]*?)<\/article>/i, /<main[\s\S]*?>([\s\S]*?)<\/main>/i, /<body[\s\S]*?>([\s\S]*?)<\/body>/i];
  let content = '';
  for (const p of patterns) { const m = html.match(p); if (m?.[1]) { content = m[1]; break; } }
  if (!content) content = html;
  content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return content.length > 3000 ? content.substring(0, 3000) + '...' : content;
}

app.post('/api/search', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    if (!query) return res.status(400).json({ error: '搜索查询不能为空' });
    res.json({ results: await searchWeb(query, maxResults) });
  } catch (error) {
    res.status(500).json({ error: '搜索失败: ' + error.message });
  }
});

// ─── 对比模式（支持搜索和上下文历史） ───
app.post('/api/compare', async (req, res) => {
  try {
    const { message, providers, enableSearch } = req.body;
    if (!message) return res.status(400).json({ error: '消息不能为空' });
    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      return res.status(400).json({ error: '至少选择一个模型' });
    }

    let searchResults = null;
    let searchContext = '';

    if (enableSearch) {
      console.log(`[对比] 联网搜索: ${message}`);
      searchResults = await searchWeb(message, 5);
      if (searchResults && searchResults.length > 0) {
        searchContext = '\n\n以下是联网搜索到的相关信息：\n\n' +
          searchResults.map((r, i) => {
            const c = r.fullContent || r.snippet || '';
            return `[${i + 1}] ${r.title}\n${c.length > 500 ? c.substring(0, 500) + '...' : c}\n来源: ${r.url}`;
          }).join('\n\n') +
          '\n\n请基于以上搜索结果回答用户的问题。如果搜索结果中没有相关信息，请基于你的知识回答。';
        console.log(`[对比] 搜索到 ${searchResults.length} 条结果`);
      }
    }

    console.log(`[对比] 请求 ${providers.length} 个模型: ${providers.map(p => `${p.provider}/${p.model}`).join(', ')}`);

    const results = await Promise.allSettled(
      providers.map(async ({ provider, model, history }) => {
        const startTime = Date.now();
        try {
          const messages = [];
          if (history && Array.isArray(history)) messages.push(...history);
          const userContent = searchContext ? `用户问题：${message}${searchContext}` : message;
          messages.push({ role: 'user', content: userContent });

          const result = await callProvider(provider, messages, model);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[对比] ✅ ${provider}/${model} (${elapsed}s)`);
          return { provider, model, ...result, elapsed };
        } catch (err) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[对比] ❌ ${provider}/${model} (${elapsed}s): ${err.message || err}`);
          throw { provider, model, error: err.message || String(err), elapsed };
        }
      })
    );

    res.json({
      searchResults,
      results: results.map(r =>
        r.status === 'fulfilled' ? { success: true, ...r.value } : { success: false, ...r.reason }
      )
    });
  } catch (error) {
    console.error('[对比] 全局错误:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`[配置] DeepSeek: ${DEEPSEEK_API_KEY ? '✅' : '❌'}  Infron (其他所有模型): ${INFRON_API_KEY ? '✅' : '❌'}  Brave Search: ${BRAVE_SEARCH_API_KEY ? '✅' : '❌'}`);
});
