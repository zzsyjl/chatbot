// ─── DOM 元素 ───
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const chatHistoryContainer = document.getElementById('chatHistory');
const searchToggle = document.getElementById('searchToggle');

// ─── 状态 ───
let sessionId = null;
let isSending = false;
let isComposing = false;
let enableSearch = false;
let providerModels = {};

const STORAGE_KEY = 'arena_conversations';
const SESSION_KEY = 'arena_current_session';
const SIDEBAR_KEY = 'arena_sidebar_collapsed';
const SLOT_COUNT = 3;

const PROVIDER_ICONS = {
  deepseek: '🔮', openai: '🤖', anthropic: '🧠',
  google: '🌐', minimax: '⚡', zhipu: '🔥', qwen: '🌟'
};

// ─── 工具函数 ───
function getChatArea(slot) { return document.querySelector(`.column-chat[data-slot="${slot}"]`); }
function getProviderSelect(slot) { return document.querySelector(`.provider-select[data-slot="${slot}"]`); }
function getModelSelect(slot) { return document.querySelector(`.model-select[data-slot="${slot}"]`); }
function getSelectedProvider(slot) { return getProviderSelect(slot).value; }
function getSelectedModel(slot) { return getModelSelect(slot).value; }
function getColumnHeader(slot) { return document.querySelector(`.model-column[data-slot="${slot}"] .column-header`); }

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ─── 会话管理 ───
function getConversations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function saveConversations(convs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
}

function getCurrentConversation() {
  if (!sessionId) return null;
  return getConversations()[sessionId] || null;
}

function saveCurrentConversation(conv) {
  const convs = getConversations();
  convs[sessionId] = conv;
  saveConversations(convs);
  localStorage.setItem(SESSION_KEY, sessionId);
  loadConversationList();
}

function createNewConversation() {
  const current = getCurrentConversation();
  if (current && (!current.rounds || current.rounds.length === 0)) return;

  sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  localStorage.setItem(SESSION_KEY, sessionId);

  const slots = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    slots.push({ provider: getSelectedProvider(i), model: getSelectedModel(i) });
  }

  saveCurrentConversation({
    id: sessionId,
    title: '新对话',
    slots,
    rounds: [],
    updatedAt: Date.now()
  });

  clearAllColumns();
  loadConversationList();
  messageInput.focus();
}

function loadConversation(convId) {
  const convs = getConversations();
  const conv = convs[convId];
  if (!conv) return;

  sessionId = convId;
  localStorage.setItem(SESSION_KEY, sessionId);

  if (conv.slots) {
    conv.slots.forEach((slot, i) => {
      if (i < SLOT_COUNT) {
        getProviderSelect(i).value = slot.provider;
        updateProviderUI(i, slot.provider);
        updateModelOptions(i, slot.provider, slot.model);
      }
    });
  }

  for (let i = 0; i < SLOT_COUNT; i++) {
    const area = getChatArea(i);
    const provider = getSelectedProvider(i);
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">${PROVIDER_ICONS[provider] || '💬'}</div><p>等待提问...</p></div>`;
  }

  if (conv.rounds && conv.rounds.length > 0) {
    conv.rounds.forEach(round => {
      for (let i = 0; i < SLOT_COUNT; i++) {
        addUserMessage(i, round.userMessage);
        if (round.searchResults && round.searchResults.length > 0) {
          addSearchResultsBanner(i, round.searchResults);
        }
        const resp = round.responses[i];
        if (resp) {
          if (resp.success !== false) {
            addAssistantMessage(i, resp.content, resp.reasoning, resp.model, resp.elapsed, round.provider || getSelectedProvider(i));
          } else {
            addErrorMessage(i, resp.error || '未知错误', resp.model);
          }
        }
      }
    });
  }

  loadConversationList();
}

function deleteConversation(convId, event) {
  if (event) event.stopPropagation();
  const convs = getConversations();
  delete convs[convId];
  saveConversations(convs);
  if (convId === sessionId) createNewConversation();
  else loadConversationList();
}
window.deleteConversation = deleteConversation;

function loadConversationList() {
  const convs = getConversations();
  chatHistoryContainer.innerHTML = '';
  const sorted = Object.values(convs).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sorted.forEach(conv => {
    const item = document.createElement('div');
    item.className = `chat-history-item${conv.id === sessionId ? ' active' : ''}`;
    item.innerHTML = `
      <div class="chat-history-title">${escapeHtml(conv.title)}</div>
      <button class="chat-history-delete" onclick="deleteConversation('${conv.id}', event)" title="删除">🗑️</button>
    `;
    item.onclick = (e) => {
      if (!e.target.closest('.chat-history-delete')) loadConversation(conv.id);
    };
    chatHistoryContainer.appendChild(item);
  });
}

// ─── Provider / Model 选择 ───
function updateProviderUI(slot, provider) {
  const header = getColumnHeader(slot);
  header.className = `column-header provider-${provider}`;
}

function updateModelOptions(slot, provider, selectedModel) {
  const select = getModelSelect(slot);
  const models = providerModels[provider] || [];
  select.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
  if (selectedModel) select.value = selectedModel;
  if (!select.value && models.length > 0) select.value = models[0].id;
}

function onProviderChange(slot) {
  const provider = getSelectedProvider(slot);
  updateProviderUI(slot, provider);
  updateModelOptions(slot, provider);

  const conv = getCurrentConversation();
  if (conv) {
    if (!conv.slots) conv.slots = [];
    conv.slots[slot] = { provider, model: getSelectedModel(slot) };
    conv.updatedAt = Date.now();
    saveCurrentConversation(conv);
  }
}

function onModelChange(slot) {
  const conv = getCurrentConversation();
  if (conv && conv.slots && conv.slots[slot]) {
    conv.slots[slot].model = getSelectedModel(slot);
    conv.updatedAt = Date.now();
    saveCurrentConversation(conv);
  }
}

// ─── 聊天UI ───
function clearAllColumns() {
  for (let i = 0; i < SLOT_COUNT; i++) {
    const area = getChatArea(i);
    const provider = getSelectedProvider(i);
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">${PROVIDER_ICONS[provider] || '💬'}</div><p>等待提问...</p></div>`;
  }
}

function addUserMessage(slot, text) {
  const area = getChatArea(slot);
  const empty = area.querySelector('.empty-state');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addSearchResultsBanner(slot, results) {
  const area = getChatArea(slot);
  const banner = document.createElement('div');
  banner.className = 'search-results-banner';

  const header = document.createElement('div');
  header.className = 'search-results-header';
  header.innerHTML = `<span>🔍 参考来源 <span class="search-results-count">(${results.length} 条)</span></span><span class="search-results-toggle">▼</span>`;

  const body = document.createElement('div');
  body.className = 'search-results-body';
  results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <a class="search-result-title" href="${escapeHtml(r.url || '#')}" target="_blank" rel="noopener">${escapeHtml(r.title || '无标题')}</a>
      <div class="search-result-snippet">${escapeHtml(r.snippet || '')}</div>
      ${r.url ? `<div class="search-result-url">${escapeHtml(r.url)}</div>` : ''}
    `;
    body.appendChild(item);
  });

  header.onclick = () => {
    const open = body.style.display === 'block';
    body.style.display = open ? 'none' : 'block';
    header.querySelector('.search-results-toggle').textContent = open ? '▼' : '▲';
  };

  banner.appendChild(header);
  banner.appendChild(body);
  area.appendChild(banner);
  area.scrollTop = area.scrollHeight;
}

function addLoading(slot) {
  const area = getChatArea(slot);
  const div = document.createElement('div');
  div.className = 'msg msg-assistant loading-msg';
  div.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function addAssistantMessage(slot, content, reasoning, model, elapsed, provider) {
  const area = getChatArea(slot);
  const colorClass = `color-${provider || getSelectedProvider(slot)}`;
  const div = document.createElement('div');
  div.className = 'msg msg-assistant';

  let html = `<div class="msg-meta"><span class="msg-model-name ${colorClass}">${escapeHtml(model || '')}</span>`;
  if (elapsed) html += `<span class="msg-elapsed">${elapsed}s</span>`;
  html += `</div>`;

  if (reasoning) {
    html += `<div class="reasoning-block">`;
    html += `<div class="reasoning-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'; this.querySelector('.reasoning-toggle-icon').textContent = this.nextElementSibling.style.display === 'block' ? '▲' : '▼'">`;
    html += `<span>🧠 推理过程</span><span class="reasoning-toggle-icon">▼</span>`;
    html += `</div>`;
    html += `<div class="reasoning-body">${escapeHtml(reasoning)}</div></div>`;
  }

  html += `<div class="msg-content"></div>`;
  div.innerHTML = html;
  const contentEl = div.querySelector('.msg-content');
  contentEl.textContent = content;
  formatMarkdown(contentEl);

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addErrorMessage(slot, error, model) {
  const area = getChatArea(slot);
  const div = document.createElement('div');
  div.className = 'msg msg-error';
  div.innerHTML = `<strong>${escapeHtml(model || '错误')}</strong>: ${escapeHtml(error)}`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

// ─── Markdown 格式化 ───
function formatMarkdown(el) {
  let text = el.textContent || '';

  const codeBlocks = [];
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const ph = `__CB_${codeBlocks.length}__`;
    codeBlocks.push({ lang: lang || '', code: code.trim() });
    return ph;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const ph = `__IC_${inlineCodes.length}__`;
    inlineCodes.push(code);
    return ph;
  });

  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  inlineCodes.forEach((c, i) => { text = text.replace(`__IC_${i}__`, `<code>${c}</code>`); });
  codeBlocks.forEach((b, i) => {
    const cls = b.lang ? ` class="language-${b.lang}"` : '';
    text = text.replace(`__CB_${i}__`, `<pre><code${cls}>${b.code}</code></pre>`);
  });

  text = text.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  text = text.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  text = text.replace(/^---$/gm, '<hr>');

  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  text = text.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

  text = text.replace(/(?:^[\*\-\+] .+(?:\n|$))+/gm, match => {
    const items = match.trim().split('\n').filter(l => /^[\*\-\+] /.test(l));
    return '<ul>' + items.map(i => `<li>${i.replace(/^[\*\-\+] /, '')}</li>`).join('') + '</ul>';
  });

  text = text.replace(/(?:^\d+\. .+(?:\n|$))+/gm, match => {
    const items = match.trim().split('\n').filter(l => /^\d+\. /.test(l));
    return '<ol>' + items.map(i => `<li>${i.replace(/^\d+\. /, '')}</li>`).join('') + '</ol>';
  });

  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  if (!text.startsWith('<')) text = '<p>' + text;
  text = text.replace(/<p><(pre|ul|ol|blockquote|h[1-6]|hr)/g, '<$1');
  text = text.replace(/<\/(pre|ul|ol|blockquote|h[1-6])><\/p>/g, '</$1>');

  el.innerHTML = text;
}

// ─── 构建历史上下文 ───
function buildHistory(slot) {
  const conv = getCurrentConversation();
  if (!conv || !conv.rounds) return [];
  const history = [];
  conv.rounds.forEach(round => {
    history.push({ role: 'user', content: round.userMessage });
    const resp = round.responses[slot];
    if (resp && resp.success !== false && resp.content) {
      history.push({ role: 'assistant', content: resp.content });
    }
  });
  return history;
}

// ─── 发送消息 ───
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || isSending) return;

  isSending = true;
  sendBtn.disabled = true;
  messageInput.value = '';
  messageInput.style.height = 'auto';

  if (!getCurrentConversation()) createNewConversation();

  const conv = getCurrentConversation();
  if (conv.title === '新对话' && conv.rounds.length === 0) {
    conv.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
  }

  conv.slots = [];
  const selections = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const provider = getSelectedProvider(i);
    const model = getSelectedModel(i);
    conv.slots.push({ provider, model });
    selections.push({ provider, model, history: buildHistory(i) });
  }

  const loadings = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    addUserMessage(i, message);
    loadings.push(addLoading(i));
  }

  const round = {
    userMessage: message,
    searchResults: null,
    responses: new Array(SLOT_COUNT).fill(null)
  };

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, providers: selections, enableSearch })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || '请求失败');
    }

    const data = await response.json();

    if (data.searchResults && data.searchResults.length > 0) {
      round.searchResults = data.searchResults;
      for (let i = 0; i < SLOT_COUNT; i++) {
        addSearchResultsBanner(i, data.searchResults);
      }
    }

    data.results.forEach((result, idx) => {
      if (loadings[idx]) { loadings[idx].remove(); loadings[idx] = null; }

      if (result.success) {
        addAssistantMessage(idx, result.content, result.reasoning, result.model, result.elapsed, result.provider);
        round.responses[idx] = {
          success: true, content: result.content, reasoning: result.reasoning || null,
          model: result.model, elapsed: result.elapsed, provider: result.provider
        };
      } else {
        addErrorMessage(idx, result.error || '未知错误', result.model);
        round.responses[idx] = {
          success: false, error: result.error || '未知错误', model: result.model,
          elapsed: result.elapsed, provider: result.provider
        };
      }
    });
  } catch (error) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (loadings[i]) { loadings[i].remove(); loadings[i] = null; }
      addErrorMessage(i, error.message, getSelectedModel(i));
      round.responses[i] = { success: false, error: error.message, model: getSelectedModel(i) };
    }
  } finally {
    loadings.forEach(el => el && el.remove());

    conv.rounds.push(round);
    conv.updatedAt = Date.now();
    saveCurrentConversation(conv);

    isSending = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

// ─── 事件绑定 ───
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('compositionstart', () => { isComposing = true; });
messageInput.addEventListener('compositionend', () => { setTimeout(() => { isComposing = false; }, 0); });

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});

clearBtn.addEventListener('click', () => {
  const conv = getCurrentConversation();
  if (conv) {
    conv.rounds = [];
    conv.title = '新对话';
    conv.updatedAt = Date.now();
    saveCurrentConversation(conv);
  }
  clearAllColumns();
});

newChatBtn.addEventListener('click', createNewConversation);

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  localStorage.setItem(SIDEBAR_KEY, sidebar.classList.contains('collapsed') ? '1' : '0');
});

searchToggle.addEventListener('change', (e) => { enableSearch = e.target.checked; });

for (let i = 0; i < SLOT_COUNT; i++) {
  getProviderSelect(i).addEventListener('change', () => onProviderChange(i));
  getModelSelect(i).addEventListener('change', () => onModelChange(i));
}

// ─── 初始化 ───
window.addEventListener('load', async () => {
  if (localStorage.getItem(SIDEBAR_KEY) === '1') sidebar.classList.add('collapsed');

  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (data.providers) {
      providerModels = {};
      Object.entries(data.providers).forEach(([key, info]) => {
        providerModels[key] = info.models || [];
      });
      for (let i = 0; i < SLOT_COUNT; i++) {
        const provider = getSelectedProvider(i);
        updateModelOptions(i, provider);
      }
    }
  } catch (e) {
    console.error('加载模型列表失败:', e);
  }

  const savedSession = localStorage.getItem(SESSION_KEY);
  const convs = getConversations();

  if (savedSession && convs[savedSession]) {
    loadConversation(savedSession);
  } else {
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem(SESSION_KEY, sessionId);
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      slots.push({ provider: getSelectedProvider(i), model: getSelectedModel(i) });
    }
    saveCurrentConversation({
      id: sessionId, title: '新对话', slots, rounds: [], updatedAt: Date.now()
    });
  }

  loadConversationList();
  messageInput.focus();
});
