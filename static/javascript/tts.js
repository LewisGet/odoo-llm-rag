// tts
const ttsEngine = {
    sentenceBuffer: "",     // 收集尚未成為完整句子的字元
    audioQueue: [],         // 存放待播放的音訊 Blob URL
    isPlaying: false,       // 標記目前是否正在播放音訊

    // 定義「斷句」的標點符號 (可依需求增減)
    punctuationRegex: /([。！？.!?\n]+)/,

    /**
     * 接收串流進來的文字，負責斷句
     */
    feedText: function(chunk) {
        this.sentenceBuffer += chunk;

        // 檢查緩衝區內是否有完整的句子
        const parts = this.sentenceBuffer.split(this.punctuationRegex);

        // 如果 parts 長度 > 1，代表至少找到一個標點符號
        if (parts.length > 1) {
            // 迴圈處理除了最後一個未完成片段以外的所有句子
            // i += 2 是因為 split 會保留 capture group (標點符號本身)
            for (let i = 0; i < parts.length - 1; i += 2) {
                const sentence = (parts[i] + (parts[i+1] || "")).trim();
                if (sentence.length > 0) {
                    this.fetchTTS(sentence); // 送去取語音
                }
            }
            // 剩下的未完成片段放回 buffer
            this.sentenceBuffer = parts[parts.length - 1];
        }
    },

    /**
     * 當 SSE 串流完全結束時呼叫，強制把剩下的零碎文字也念出來
     */
    flush: function() {
        const sentence = this.sentenceBuffer.trim();
        if (sentence.length > 0) {
            this.fetchTTS(sentence);
        }
        this.sentenceBuffer = ""; // 清空
    },

    /**
     * 呼叫後端 API 獲取音訊 Blob
     */
    fetchTTS: async function(text) {
        // 過濾掉標記語言，防止 TTS 念出亂碼
        {% raw %}
        const cleanText = text.replace(/\{\{%%img:[^%]+%%\}\}/g, '')
                              .replace(/https?:\/\/[^\s]+/g, '');
        {% endraw %}

        if (!cleanText.trim()) return; // 如果清理後沒文字了就略過

        try {
            const response = await fetch('/ai/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText })
            });

            if (!response.ok) throw new Error("TTS Request failed");

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);

            // 將取回的音訊推入隊列
            this.audioQueue.push(audioUrl);
            this.playNext(); // 嘗試播放

        } catch (error) {
            console.error("TTS 獲取失敗:", error);
        }
    },

    /**
     * 播放隊列管理，確保音訊依序播放不重疊
     */
    playNext: function() {
        if (this.isPlaying || this.audioQueue.length === 0) return;

        this.isPlaying = true;
        const currentAudioUrl = this.audioQueue.shift();
        const audio = new Audio(currentAudioUrl);

        audio.onended = () => {
            this.isPlaying = false;
            URL.revokeObjectURL(currentAudioUrl); // 釋放記憶體，減少實體耗損
            this.playNext(); // 播完這句，立刻檢查有沒有下一句
        };

        audio.onerror = () => {
            console.error("音訊播放錯誤");
            this.isPlaying = false;
            this.playNext();
        };

        audio.play().catch(e => {
            console.warn("自動播放被瀏覽器阻擋:", e);
            this.isPlaying = false;
        });
    }
};

// tts hook
ttsEngine.reset = function() {
    this.sentenceBuffer = "";
    this.audioQueue = [];
    this.isPlaying = false;
};

// 1. 訂閱「發送前」事件：清空上一句還沒念完的語音
streamHooks.preExecute.push((context) => {
    console.log("Hook 觸發：準備接收問題...", context.prompt);
    ttsEngine.reset();
});

// 2. 訂閱「串流中」事件：將文字碎片餵給 TTS 引擎進行斷句
streamHooks.execute.push((textChunk) => {
    ttsEngine.feedText(textChunk);
});

// 3. 訂閱「結束後」事件：強制把最後的碎片念完
streamHooks.postExecute.push((context) => {
    console.log("Hook 觸發：串流結束", context.status);
    ttsEngine.flush();
});
