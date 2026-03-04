// 当前会话ID
let sessionId = null;

const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const modelSelect = document.getElementById('modelSelect');
const chatHistoryContainer = document.getElementById('chatHistory');
const searchToggle = document.getElementById('searchToggle');

// 当前选择的模型
let currentModel = modelSelect.value;

// 联网搜索开关状态
let enableSearch = false;

// 防止重复创建新对话的标志
let isCreatingNewConversation = false;

// 输入法组合状态标志
let isComposing = false;

// 存储消息ID和索引的映射
const messageIndexMap = new Map();
let messageCounter = 0;

// 对话历史存储键
const CHAT_HISTORY_KEY = 'chatbot_conversations';
const CURRENT_SESSION_KEY = 'chatbot_current_session';

// 初始化：加载或创建会话
function initSession() {
    // 尝试从localStorage恢复当前会话
    const savedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
    const conversations = getConversations();
    
    if (savedSessionId && conversations[savedSessionId]) {
        // 恢复之前的会话
        sessionId = savedSessionId;
        loadConversation(sessionId);
    } else {
        // 创建新会话
        createNewConversation();
    }
    
    // 加载对话历史列表
    loadConversationList();
}

// 创建新对话
function createNewConversation() {
    // 如果正在创建新对话，直接返回
    if (isCreatingNewConversation) {
        console.log('[新对话] 正在创建中，跳过重复请求');
        return;
    }
    
    // 检查当前对话是否为空（没有消息）
    const conversations = getConversations();
    const currentConversation = sessionId ? conversations[sessionId] : null;
    const isEmpty = !currentConversation || !currentConversation.messages || currentConversation.messages.length === 0;
    
    // 如果当前对话为空，直接返回，不创建新的
    if (isEmpty && sessionId) {
        console.log('[新对话] 当前对话为空，无需创建新对话');
        return;
    }
    
    // 设置标志，防止重复创建
    isCreatingNewConversation = true;
    
    // 保存当前对话（如果有内容）
    if (!isEmpty) {
        saveConversation();
    }
    
    // 创建新的会话ID
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    
    // 清空界面
    chatContainer.innerHTML = `
        <div class="welcome-message">
            <h1>AI 聊天助手</h1>
            <p>基于 DeepSeek AI 的智能对话助手</p>
        </div>
    `;
    
    // 更新历史列表
    loadConversationList();
    
    // 重置标志
    setTimeout(() => {
        isCreatingNewConversation = false;
    }, 500);
}

// 获取所有对话
function getConversations() {
    const data = localStorage.getItem(CHAT_HISTORY_KEY);
    return data ? JSON.parse(data) : {};
}

// 保存当前对话
function saveConversation() {
    const conversations = getConversations();
    const messages = [];
    
    // 从界面提取所有消息
    const messageElements = chatContainer.querySelectorAll('.message[data-role]');
    messageElements.forEach(msgEl => {
        const role = msgEl.getAttribute('data-role');
        const contentEl = msgEl.querySelector('.message-content');
        if (contentEl) {
            // 优先使用data属性中保存的原始内容，如果没有则使用textContent
            const originalContent = msgEl.getAttribute('data-original-content') || 
                                   contentEl.getAttribute('data-original-content') ||
                                   contentEl.textContent || 
                                   contentEl.innerText;
            
            if (originalContent && !originalContent.includes('loading-dot')) {
                // 提取推理过程（如果有）
                const reasoningEl = msgEl.querySelector('.reasoning-content');
                const reasoning = reasoningEl ? (reasoningEl.getAttribute('data-original-content') || reasoningEl.textContent) : null;
                
                // 提取搜索结果（如果有）
                let searchResults = null;
                const searchResultsContainer = msgEl.querySelector('.search-results-container');
                if (searchResultsContainer && role === 'assistant') {
                    // 优先使用保存的JSON数据
                    const savedData = searchResultsContainer.getAttribute('data-search-results');
                    if (savedData) {
                        try {
                            searchResults = JSON.parse(savedData);
                        } catch (e) {
                            console.error('解析搜索结果数据失败:', e);
                        }
                    }
                    // 如果没有保存的数据，从DOM中提取
                    if (!searchResults) {
                        const resultItems = searchResultsContainer.querySelectorAll('.search-result-item');
                        if (resultItems.length > 0) {
                            searchResults = [];
                            resultItems.forEach(item => {
                                const titleEl = item.querySelector('.search-result-title');
                                const snippetEl = item.querySelector('.search-result-snippet');
                                const urlEl = item.querySelector('.search-result-url');
                                if (titleEl) {
                                    searchResults.push({
                                        title: titleEl.textContent,
                                        snippet: snippetEl ? snippetEl.textContent : '',
                                        url: urlEl ? urlEl.textContent : (titleEl.href !== '#' ? titleEl.href : '')
                                    });
                                }
                            });
                        }
                    }
                }
                
                messages.push({
                    role: role,
                    content: originalContent,
                    reasoning: reasoning || undefined,
                    searchResults: searchResults || undefined
                });
            }
        }
    });
    
    // 获取对话标题（第一条用户消息的前30个字符）
    const firstUserMessage = messages.find(m => m.role === 'user');
    const title = firstUserMessage ? 
        (firstUserMessage.content.substring(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '')) : 
        '新对话';
    
    conversations[sessionId] = {
        id: sessionId,
        title: title,
        messages: messages,
        model: currentModel,
        updatedAt: Date.now()
    };
    
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations));
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    
    // 更新历史列表
    loadConversationList();
}

// 加载对话
function loadConversation(conversationId) {
    const conversations = getConversations();
    const conversation = conversations[conversationId];
    
    if (!conversation) {
        createNewConversation();
        return;
    }
    
    sessionId = conversationId;
    currentModel = conversation.model || modelSelect.value;
    modelSelect.value = currentModel;
    
    // 清空界面
    chatContainer.innerHTML = '';
    
    // 恢复消息
    if (conversation.messages && conversation.messages.length > 0) {
        conversation.messages.forEach(msg => {
            addMessage(msg.role, msg.content, false, null, msg.reasoning || null, msg.searchResults || null);
        });
    } else {
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <h1>AI 聊天助手</h1>
                <p>基于 DeepSeek AI 的智能对话助手</p>
            </div>
        `;
    }
    
    scrollToBottom();
}

// 加载对话历史列表
function loadConversationList() {
    const conversations = getConversations();
    chatHistoryContainer.innerHTML = '';
    
    // 按更新时间排序
    const sortedConversations = Object.values(conversations)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    
    sortedConversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `chat-history-item ${conv.id === sessionId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-history-title">${conv.title}</div>
            <div class="chat-history-actions">
                <button class="chat-history-delete" onclick="deleteConversation('${conv.id}', event)">🗑️</button>
            </div>
        `;
        item.onclick = (e) => {
            if (!e.target.closest('.chat-history-delete')) {
                loadConversation(conv.id);
            }
        };
        chatHistoryContainer.appendChild(item);
    });
}

// 删除对话
function deleteConversation(conversationId, event) {
    event.stopPropagation();
    
    if (!confirm('确定要删除这个对话吗？')) {
        return;
    }
    
    const conversations = getConversations();
    delete conversations[conversationId];
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations));
    
    // 如果删除的是当前对话，创建新对话
    if (conversationId === sessionId) {
        createNewConversation();
    } else {
        loadConversationList();
    }
}

// 将函数暴露到全局，供HTML调用
window.deleteConversation = deleteConversation;

// 自动调整输入框高度
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// 初始化搜索开关状态
if (searchToggle) {
    enableSearch = searchToggle.checked;
    console.log(`[搜索] 初始化 - 联网搜索${enableSearch ? '已启用' : '已禁用'}`);
}

// 监听搜索开关变化
if (searchToggle) {
    searchToggle.addEventListener('change', (e) => {
        enableSearch = e.target.checked;
        console.log(`[搜索] 联网搜索${enableSearch ? '已启用' : '已禁用'}`);
    });
}

// 发送消息
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // 添加用户消息到界面
    addMessage('user', message);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // 显示加载状态
    const loadingId = addMessage('assistant', '', true);
    
    // 禁用发送按钮
    sendBtn.disabled = true;

    try {
        // 确保使用当前选择的模型
        const modelToUse = currentModel || modelSelect.value;
        console.log(`[前端发送] 消息: "${message.substring(0, 50)}...", 模型: ${modelToUse}, 联网搜索: ${enableSearch}, sessionId: ${sessionId}`);
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                sessionId: sessionId,
                model: modelToUse,
                enableSearch: enableSearch
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '请求失败');
        }
        
        const data = await response.json();
        
        // 记录使用的模型（用于调试）
        if (data.model) {
            console.log(`[前端] 收到响应，使用的模型: ${data.model}, 当前选择: ${currentModel}`);
        }
        
        // 调试：检查是否有推理过程
        if (data.reasoning) {
            console.log(`[前端] ✅ 收到推理过程，长度: ${data.reasoning.length} 字符`);
            console.log(`[前端] 推理过程预览: ${data.reasoning.substring(0, 100)}...`);
        } else {
            console.log(`[前端] ❌ 未收到推理过程`);
        }
        
        // 调试：检查是否有搜索结果
        console.log(`[前端] 检查搜索结果 - searchResults存在:`, 'searchResults' in data, `值:`, data.searchResults);
        if (data.searchResults !== undefined && data.searchResults !== null) {
            if (Array.isArray(data.searchResults)) {
                console.log(`[前端] ✅ 收到搜索结果，数量: ${data.searchResults.length}`);
                if (data.searchResults.length > 0) {
                    console.log(`[前端] 搜索结果详情:`, data.searchResults);
                } else {
                    console.log(`[前端] ⚠️ 搜索结果为空数组`);
                }
            } else {
                console.log(`[前端] ⚠️ 搜索结果不是数组:`, typeof data.searchResults, data.searchResults);
            }
        } else {
            console.log(`[前端] ❌ 未收到搜索结果 (searchResults为${data.searchResults})`);
        }
        
        // 移除加载消息，添加实际响应（包含推理过程和搜索结果）
        removeMessage(loadingId);
        addMessage('assistant', data.response, false, null, data.reasoning, data.searchResults || null);
        
        // 保存对话
        saveConversation();
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        
        // 显示友好的错误信息
        let errorMessage = '抱歉，发生了错误。请稍后再试。';
        if (error.message) {
            errorMessage = error.message;
            // 如果是余额不足的错误，添加额外提示
            if (error.message.includes('余额不足') || error.message.includes('Insufficient Balance')) {
                errorMessage += '\n\n💡 提示：请前往 DeepSeek 官网充值账户余额。';
            }
        }
        
        addMessage('assistant', errorMessage);
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// 添加消息到界面
function addMessage(role, content, isLoading = false, messageId = null, reasoning = null, searchResults = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    // 生成或使用提供的消息ID
    if (!messageId) {
        messageId = `msg-${++messageCounter}-${Date.now()}`;
    }
    messageDiv.id = messageId;
    messageDiv.setAttribute('data-role', role);
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '你' : 'AI';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    
    // 如果有推理过程，先添加推理模块
    if (reasoning && role === 'assistant' && !isLoading) {
        console.log(`[前端] 创建推理模块，推理内容长度: ${reasoning.length}`);
        const reasoningContainer = document.createElement('div');
        reasoningContainer.className = 'reasoning-container';
        
        const reasoningHeader = document.createElement('div');
        reasoningHeader.className = 'reasoning-header';
        reasoningHeader.innerHTML = `
            <span class="reasoning-title">🧠 推理过程</span>
            <span class="reasoning-toggle">▼</span>
        `;
        
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-content';
        reasoningContent.style.display = 'none';
        // 保存原始推理内容
        reasoningContent.setAttribute('data-original-content', reasoning);
        reasoningContent.textContent = reasoning;
        formatMessage(reasoningContent);
        
        // 切换显示/隐藏
        reasoningHeader.onclick = () => {
            const isHidden = reasoningContent.style.display === 'none';
            reasoningContent.style.display = isHidden ? 'block' : 'none';
            reasoningHeader.querySelector('.reasoning-toggle').textContent = isHidden ? '▲' : '▼';
        };
        
        reasoningContainer.appendChild(reasoningHeader);
        reasoningContainer.appendChild(reasoningContent);
        contentWrapper.appendChild(reasoningContainer);
        console.log(`[前端] ✅ 推理模块已添加到界面`);
    } else {
        if (role === 'assistant' && !isLoading) {
            console.log(`[前端] ❌ 未创建推理模块 - reasoning: ${reasoning}, role: ${role}, isLoading: ${isLoading}`);
        }
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (isLoading) {
        contentDiv.innerHTML = '<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
    } else {
        // 保存原始内容到data属性，用于后续重新渲染
        contentDiv.setAttribute('data-original-content', content);
        messageDiv.setAttribute('data-original-content', content);
        
        // 简单的Markdown处理
        contentDiv.textContent = content;
        formatMessage(contentDiv);
    }
    
    contentWrapper.appendChild(contentDiv);
    
    // 如果有搜索结果（包括空数组），在消息内容下方显示
    // 只要 searchResults 是数组（即使是空数组），就显示参考来源区域
    if (searchResults !== undefined && searchResults !== null && Array.isArray(searchResults) && role === 'assistant' && !isLoading) {
        console.log(`[前端] ✅ 创建搜索结果容器，结果数量: ${searchResults.length}`);
        
        const searchResultsContainer = document.createElement('div');
        searchResultsContainer.className = 'search-results-container';
        // 保存原始搜索结果数据，用于后续保存和加载
        searchResultsContainer.setAttribute('data-search-results', JSON.stringify(searchResults));
        
        const searchResultsHeader = document.createElement('div');
        searchResultsHeader.className = 'search-results-header';
        if (searchResults.length > 0) {
            searchResultsHeader.innerHTML = `
                <span class="search-results-title">🔍 参考来源</span>
                <span class="search-results-count">${searchResults.length} 条结果</span>
            `;
        } else {
            searchResultsHeader.innerHTML = `
                <span class="search-results-title">🔍 参考来源</span>
                <span class="search-results-count">未找到相关结果</span>
            `;
        }
        searchResultsContainer.appendChild(searchResultsHeader);
        
        const searchResultsList = document.createElement('div');
        searchResultsList.className = 'search-results-list';
        
        if (searchResults.length > 0) {
            searchResults.forEach((result, index) => {
                if (!result) return; // 跳过空结果
                
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                
                const resultTitle = document.createElement('a');
                resultTitle.className = 'search-result-title';
                resultTitle.href = result.url || '#';
                resultTitle.target = '_blank';
                resultTitle.rel = 'noopener noreferrer';
                resultTitle.textContent = result.title || `结果 ${index + 1}`;
                
                const resultSnippet = document.createElement('div');
                resultSnippet.className = 'search-result-snippet';
                resultSnippet.textContent = result.snippet || '';
                
                if (result.url && result.url !== '#') {
                    const resultUrl = document.createElement('div');
                    resultUrl.className = 'search-result-url';
                    resultUrl.textContent = result.url;
                    resultItem.appendChild(resultUrl);
                }
                
                resultItem.appendChild(resultTitle);
                resultItem.appendChild(resultSnippet);
                
                searchResultsList.appendChild(resultItem);
            });
        } else {
            // 如果没有搜索结果，显示提示信息
            const noResultsItem = document.createElement('div');
            noResultsItem.className = 'search-result-item';
            noResultsItem.style.textAlign = 'center';
            noResultsItem.style.padding = '20px';
            noResultsItem.style.color = '#8e8ea0';
            noResultsItem.textContent = '未找到相关搜索结果';
            searchResultsList.appendChild(noResultsItem);
        }
        
        searchResultsContainer.appendChild(searchResultsList);
        contentWrapper.appendChild(searchResultsContainer);
        console.log(`[前端] ✅ 搜索结果容器已添加到DOM，包含 ${searchResultsList.children.length} 个结果项`);
    } else if (searchResults !== undefined && searchResults !== null) {
        console.log(`[前端] ⚠️ 搜索结果格式不正确:`, searchResults, `类型:`, typeof searchResults);
    }
    
    // 为用户消息添加编辑按钮
    if (role === 'user' && !isLoading) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = '✏️ 编辑';
        editBtn.title = '编辑';
        editBtn.onclick = () => editMessage(messageId, content);
        
        actionsDiv.appendChild(editBtn);
        contentWrapper.appendChild(actionsDiv);
    }
    
    // 为AI消息添加重新生成按钮
    if (role === 'assistant' && !isLoading) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'message-action-btn regenerate-btn';
        regenerateBtn.innerHTML = '🔄';
        regenerateBtn.title = '重新生成';
        regenerateBtn.onclick = () => regenerateResponse(messageId);
        
        actionsDiv.appendChild(regenerateBtn);
        contentWrapper.appendChild(actionsDiv);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentWrapper);
    
    // 移除欢迎消息
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    return messageId;
}

// 移除消息（用于加载状态）
function removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

// 格式化消息内容（完整的Markdown支持）
function formatMessage(element) {
    let text = element.textContent || element.innerText;
    
    // 先处理代码块（避免被其他规则影响）
    const codeBlocks = [];
    text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
        const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
        codeBlocks.push({ lang: lang || '', code: code.trim() });
        return placeholder;
    });
    
    // 处理行内代码（避免被其他规则影响）
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
        const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
        inlineCodes.push(code);
        return placeholder;
    });
    
    // 转义HTML特殊字符
    text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // 恢复行内代码
    inlineCodes.forEach((code, index) => {
        text = text.replace(`__INLINE_CODE_${index}__`, `<code>${code}</code>`);
    });
    
    // 恢复代码块
    codeBlocks.forEach((block, index) => {
        const language = block.lang ? ` class="language-${block.lang}"` : '';
        const codeHtml = `<pre><code${language}>${block.code}</code></pre>`;
        text = text.replace(`__CODE_BLOCK_${index}__`, codeHtml);
    });
    
    // 处理标题（按顺序，从h6到h1）
    text = text.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    text = text.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // 处理水平线
    text = text.replace(/^---$/gm, '<hr>');
    text = text.replace(/^\*\*\*$/gm, '<hr>');
    text = text.replace(/^___$/gm, '<hr>');
    
    // 处理引用块（多行）
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // 合并连续的blockquote
    text = text.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');
    
    // 处理无序列表
    const ulPattern = /(?:^[\*\-\+] .+(?:\n|$))+/gm;
    text = text.replace(ulPattern, (match) => {
        const items = match.trim().split('\n').filter(line => /^[\*\-\+] /.test(line));
        const listItems = items.map(item => `<li>${item.replace(/^[\*\-\+] /, '')}</li>`).join('');
        return `<ul>${listItems}</ul>`;
    });
    
    // 处理有序列表
    const olPattern = /(?:^\d+\. .+(?:\n|$))+/gm;
    text = text.replace(olPattern, (match) => {
        const items = match.trim().split('\n').filter(line => /^\d+\. /.test(line));
        const listItems = items.map(item => `<li>${item.replace(/^\d+\. /, '')}</li>`).join('');
        return `<ol>${listItems}</ol>`;
    });
    
    // 处理粗体和斜体（需要避免与列表符号冲突）
    // 先处理粗体（**text** 或 __text__）
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(?!\s)([^_]+)__(?!\s)/g, '<strong>$1</strong>');
    
    // 再处理斜体（*text* 或 _text_），但要避免与粗体冲突
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
    
    // 处理删除线
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    
    // 处理链接 [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // 处理换行：双换行作为段落分隔，单换行作为<br>
    // 但需要避免影响已处理的HTML标签
    const lines = text.split('\n');
    const processedLines = [];
    let inBlock = false; // 是否在代码块、列表等块级元素中
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 检查是否是块级元素
        if (/^<(pre|ul|ol|blockquote|h[1-6]|hr)/.test(trimmedLine)) {
            inBlock = true;
            processedLines.push(line);
        } else if (/<\/(pre|ul|ol|blockquote|h[1-6])>/.test(trimmedLine)) {
            inBlock = false;
            processedLines.push(line);
        } else if (trimmedLine === '') {
            // 空行：如果在块级元素中，忽略；否则作为段落分隔
            if (!inBlock) {
                processedLines.push('</p><p>');
            }
        } else {
            // 普通行：如果在块级元素中，保持原样；否则添加<br>
            if (inBlock) {
                processedLines.push(line);
            } else {
                // 检查是否是段落开始
                if (i === 0 || lines[i - 1].trim() === '' || /<\/(pre|ul|ol|blockquote|h[1-6]|p)>/.test(lines[i - 1])) {
                    if (!trimmedLine.startsWith('<')) {
                        processedLines.push('<p>' + line);
                    } else {
                        processedLines.push(line);
                    }
                } else {
                    processedLines.push('<br>' + line);
                }
            }
        }
    }
    
    text = processedLines.join('\n');
    
    // 确保文本被段落包裹（如果没有块级元素）
    if (!text.includes('<pre') && !text.includes('<ul') && !text.includes('<ol') && 
        !text.includes('<blockquote') && !text.includes('<h')) {
        if (!text.startsWith('<p>')) {
            text = '<p>' + text;
        }
        if (!text.endsWith('</p>')) {
            text = text + '</p>';
        }
    }
    
    // 清理多余的段落标签
    text = text.replace(/<p><\/p>/g, '');
    text = text.replace(/<p>(<[^>]+>)/g, '$1');
    text = text.replace(/(<\/[^>]+>)<\/p>/g, '$1');
    text = text.replace(/<p>(<pre)/g, '$1');
    text = text.replace(/(<\/pre>)<\/p>/g, '$1');
    
    element.innerHTML = text;
}

// 编辑消息
function editMessage(messageId, currentContent) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;
    
    const contentDiv = messageDiv.querySelector('.message-content');
    const actionsDiv = messageDiv.querySelector('.message-actions');
    
    // 创建编辑输入框
    const editTextarea = document.createElement('textarea');
    editTextarea.className = 'message-edit-input';
    editTextarea.value = currentContent;
    editTextarea.rows = Math.max(3, currentContent.split('\n').length);
    
    // 创建保存和取消按钮
    const editActions = document.createElement('div');
    editActions.className = 'edit-actions';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'edit-btn-save';
    saveBtn.textContent = '保存';
    saveBtn.onclick = () => {
        const newContent = editTextarea.value.trim();
        if (newContent) {
            saveEditedMessage(messageId, newContent);
        }
    };
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'edit-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => {
        contentDiv.style.display = 'block';
        editTextarea.remove();
        editActions.remove();
        if (actionsDiv) actionsDiv.style.display = 'flex';
    };
    
    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);
    
    // 隐藏原内容和操作按钮
    contentDiv.style.display = 'none';
    if (actionsDiv) actionsDiv.style.display = 'none';
    
    // 插入编辑界面
    const wrapper = messageDiv.querySelector('.message-content-wrapper');
    wrapper.insertBefore(editTextarea, contentDiv);
    wrapper.appendChild(editActions);
    
    editTextarea.focus();
    editTextarea.select();
}

// 保存编辑后的消息
async function saveEditedMessage(messageId, newContent) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;
    
    const contentDiv = messageDiv.querySelector('.message-content');
    const editInput = messageDiv.querySelector('.message-edit-input');
    const editActions = messageDiv.querySelector('.edit-actions');
    const actionsDiv = messageDiv.querySelector('.message-actions');
    
    // 更新显示内容
    contentDiv.textContent = newContent;
    formatMessage(contentDiv);
    contentDiv.style.display = 'block';
    
    // 移除编辑界面
    editInput.remove();
    editActions.remove();
    if (actionsDiv) actionsDiv.style.display = 'flex';
    
    // 找到该消息的索引
    const allMessages = Array.from(chatContainer.querySelectorAll('.message[data-role="user"]'));
    const messageIndex = allMessages.findIndex(msg => msg.id === messageId);
    
    if (messageIndex !== -1) {
        // 删除该消息对应的AI回复
        let nextSibling = messageDiv.nextElementSibling;
        if (nextSibling && nextSibling.getAttribute('data-role') === 'assistant') {
            nextSibling.remove();
        }
        
        // 删除后续的所有消息（用户消息和对应的AI回复）
        const remainingMessages = Array.from(chatContainer.querySelectorAll('.message[data-role="user"]'));
        for (let i = messageIndex + 1; i < remainingMessages.length; i++) {
            const userMsg = remainingMessages[i];
            userMsg.remove();
            
            // 删除对应的AI回复
            const aiReply = userMsg.nextElementSibling;
            if (aiReply && aiReply.getAttribute('data-role') === 'assistant') {
                aiReply.remove();
            }
        }
        
        // 更新服务器端历史
        await updateHistoryAfterEdit(messageIndex, newContent);
        
        // 重新发送消息获取新回复
        await sendMessageWithContent(newContent);
    }
}


// 重新生成回复
async function regenerateResponse(messageId) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;
    
    // 找到对应的用户消息
    let userMessage = messageDiv.previousElementSibling;
    while (userMessage && userMessage.getAttribute('data-role') !== 'user') {
        userMessage = userMessage.previousElementSibling;
    }
    
    if (!userMessage) return;
    
    const userContent = userMessage.querySelector('.message-content').textContent;
    
    // 删除当前AI回复
    messageDiv.remove();
    
    // 显示加载状态
    const loadingId = addMessage('assistant', '', true);
    
    try {
        // 确保使用当前选择的模型
        const modelToUse = currentModel || modelSelect.value;
        console.log(`[重新生成] 使用模型: ${modelToUse}`);
        
        // 重新发送请求
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: userContent,
                sessionId: sessionId,
                model: modelToUse,
                regenerate: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '请求失败');
        }
        
        const data = await response.json();
        
        // 移除加载消息，添加实际响应（包含推理过程和搜索结果）
        removeMessage(loadingId);
        addMessage('assistant', data.response, false, null, data.reasoning, data.searchResults || null);
        
        // 保存对话
        saveConversation();
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        
        let errorMessage = '抱歉，发生了错误。请稍后再试。';
        if (error.message) {
            errorMessage = error.message;
        }
        
        addMessage('assistant', errorMessage);
    }
}

// 使用指定内容发送消息
async function sendMessageWithContent(content) {
    // 显示加载状态
    const loadingId = addMessage('assistant', '', true);
    
    // 禁用发送按钮
    sendBtn.disabled = true;

    try {
        // 确保使用当前选择的模型
        const modelToUse = currentModel || modelSelect.value;
        console.log(`[编辑后发送] 使用模型: ${modelToUse}`);
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: content,
                sessionId: sessionId,
                model: modelToUse
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '请求失败');
        }
        
        const data = await response.json();
        
        // 移除加载消息，添加实际响应（包含推理过程和搜索结果）
        removeMessage(loadingId);
        addMessage('assistant', data.response, false, null, data.reasoning, data.searchResults || null);
        
        // 保存对话
        saveConversation();
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        
        let errorMessage = '抱歉，发生了错误。请稍后再试。';
        if (error.message) {
            errorMessage = error.message;
        }
        
        addMessage('assistant', errorMessage);
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// 更新服务器端历史（编辑后）
async function updateHistoryAfterEdit(editIndex, newContent) {
    try {
        await fetch('/api/history/edit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId: sessionId,
                editIndex: editIndex,
                newContent: newContent
            })
        });
    } catch (error) {
        console.error('更新历史失败:', error);
    }
}


// 滚动到底部
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 发送按钮点击事件
sendBtn.addEventListener('click', sendMessage);

// 输入法组合事件处理（用于调试和备用检测）
messageInput.addEventListener('compositionstart', () => {
    isComposing = true;
});

messageInput.addEventListener('compositionupdate', () => {
    isComposing = true;
});

messageInput.addEventListener('compositionend', () => {
    // 延迟重置，确保 keydown 事件能正确检测到
    setTimeout(() => {
        isComposing = false;
    }, 0);
});

// 回车发送（Shift+Enter换行）
// 注意：在输入法组合过程中，不发送消息
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        // 使用浏览器原生的 isComposing 属性检测输入法组合状态
        // 如果正在使用输入法组合，不阻止默认行为，让输入法先确认输入
        if (e.isComposing || isComposing) {
            return;
        }
        e.preventDefault();
        sendMessage();
    }
});

// 新对话按钮
newChatBtn.addEventListener('click', () => {
    // 保存当前对话
    saveConversation();
    
    // 创建新对话
    createNewConversation();
    
    // 清除服务器端的会话历史（可选，因为我们在前端管理）
    fetch('/api/clear', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sessionId: sessionId
        })
    }).catch(err => console.error('清除服务器历史失败:', err));
});

// 页面加载时初始化
window.addEventListener('load', async () => {
    // 初始化会话
    initSession();
    
    // 确保搜索开关状态正确初始化
    if (searchToggle) {
        enableSearch = searchToggle.checked;
        console.log(`[初始化] 搜索开关状态: ${enableSearch}`);
    }
    
    messageInput.focus();
    
    // 可选：从服务器加载可用模型列表
    try {
        const response = await fetch('/api/models');
        const data = await response.json();
        if (data.models && data.models.length > 0) {
            // 清空现有选项
            modelSelect.innerHTML = '';
            // 添加模型选项
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = `${model.name}${model.description ? ' - ' + model.description : ''}`;
                modelSelect.appendChild(option);
            });
            modelSelect.value = currentModel;
        }
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
});

// 模型选择变化时保存
modelSelect.addEventListener('change', (e) => {
    const newModel = e.target.value;
    console.log(`[前端] 模型切换: ${currentModel} -> ${newModel}`);
    currentModel = newModel;
    saveConversation();
});
