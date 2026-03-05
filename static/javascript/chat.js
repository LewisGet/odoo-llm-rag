
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// templates
const tplUser = document.getElementById('tpl-msg-user');
const tplAssistant = document.getElementById('tpl-msg-assistant');
const tplImg = document.getElementById('tpl-media-img');
const tplYoutube = document.getElementById('tpl-media-youtube');

// message dom
function createMessageElement(role) {
    const template = role === 'user' ? tplUser : tplAssistant;
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.message-row');
    const contentDiv = clone.querySelector('.msg-content');

    // 使用 data 屬性儲存原始文字，供掃描器使用
    contentDiv.dataset.rawText = "";
    contentDiv.dataset.renderedText = "";

    chatWindow.appendChild(clone);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // 回傳實際在 DOM 中的 element
    return chatWindow.lastElementChild.querySelector('.msg-content');
}

async function send() {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';

    const userBubble = createMessageElement('user');
    userBubble.textContent = text;
    const aiBubble = createMessageElement('assistant');

    streamHooks.trigger('preExecute', { prompt: text });

    try {
        const response = await fetch('/ai/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        if (!response.ok) throw new Error("Network response was not ok");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                streamHooks.trigger('postExecute', { status: 'success' });
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const payload = line.substring(6).trim();
                    if (payload === '[DONE]') continue;

                    try {
                        const data = JSON.parse(payload);
                        aiBubble.dataset.rawText += data.text;

                        streamHooks.trigger('execute', data.text);

                    } catch(e) { console.error("JSON Parse error:", e); }
                }
            }
        }
    } catch (error) {
        console.warn("api disconnect.", error);
        streamHooks.trigger('onEnd', { status: 'error', error: error });
    }
}

sendBtn.addEventListener('click', send);
userInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') send(); });

setInterval(() => {
    // 找出所有 role 不是 user 的訊息框
    const assistantMessages = document.querySelectorAll('.message-row[data-role="assistant"] .msg-content');

    assistantMessages.forEach(msgDiv => {
        const rawText = msgDiv.dataset.rawText;
        const renderedText = msgDiv.dataset.renderedText;

        // 如果文字沒有更新，就不做處理，節省效能
        if (rawText === renderedText) return;

        // 更新已渲染標記
        msgDiv.dataset.renderedText = rawText;

        // 準備解析內容。為了避免 XSS 且能插入 DOM，我們使用 DocumentFragment
        const fragment = document.createDocumentFragment();

        {% raw %}
        // 正則表達式
        const imgRegex = /\{\{%%img:([^%]+)%%\}\}/g;
        // 匹配 YouTube URL (擷取 Video ID)
        const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        {% endraw %}

        // 先將純文字用一種正則切開，這裡為了簡化，我們先處理一個統一的 Tokenizer 邏輯
        // 將所有需要替換的部分打上標記，再進行拆解
        let processText = rawText;
        let tokens = [];

        // 替換圖片為 token
        processText = processText.replace(imgRegex, (match, id) => {
            const tokenId = `__TOKEN_IMG_${tokens.length}__`;
            tokens.push({ id: tokenId, type: 'img', value: id });
            return tokenId;
        });

        // 替換 YouTube 為 token
        processText = processText.replace(ytRegex, (match, id) => {
            const tokenId = `__TOKEN_YT_${tokens.length}__`;
            tokens.push({ id: tokenId, type: 'youtube', value: id });
            return tokenId;
        });

        // 使用正則將文字與 token 分開
        const tokenRegex = /(__TOKEN_[A-Z]+_\d+__)/g;
        const parts = processText.split(tokenRegex);

        parts.forEach(part => {
            if (!part) return;

            const tokenMatch = tokens.find(t => t.id === part);
            if (tokenMatch) {
                // 如果是 Token，實例化對應的 Template
                if (tokenMatch.type === 'img') {
                    const clone = tplImg.content.cloneNode(true);
                    clone.querySelector('img').src = `/image/${tokenMatch.value}`;
                    fragment.appendChild(clone);
                } else if (tokenMatch.type === 'youtube') {
                    const clone = tplYoutube.content.cloneNode(true);
                    clone.querySelector('iframe').src = `https://www.youtube.com/embed/${tokenMatch.value}`;
                    fragment.appendChild(clone);
                }
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        });

        // 清空原本內容並放入新解析的內容
        msgDiv.innerHTML = '';
        msgDiv.appendChild(fragment);

        // 滾動到底部
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}, 200);
