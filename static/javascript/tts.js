// tts
const ttsEngine = {
    sentenceBuffer: "",
    sentenceCount: 0,       // 用來標記句子的序號 (索引)
    audioCache: {},         // 【核心】：存放已下載好的 Blob URL，Key 是序號
    nextIndexToPlay: 0,     // 目前該播放哪一個序號的句子
    isPlaying: false,       // 播放器狀態鎖
    currentAudio: null,     // 供中斷使用

    punctuationRegex: /([。！？.!?\n]+)/,

    reset: function() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        // 清放快取中的所有 URL，避免記憶體洩漏
        Object.values(this.audioCache).forEach(url => URL.revokeObjectURL(url));

        this.sentenceBuffer = "";
        this.sentenceCount = 0;
        this.audioCache = {};
        this.nextIndexToPlay = 0;
        this.isPlaying = false;
    },

    feedText: function(chunk) {
        this.sentenceBuffer += chunk;
        const parts = this.sentenceBuffer.split(this.punctuationRegex);

        if (parts.length > 1) {
            for (let i = 0; i < parts.length - 1; i += 2) {
                const sentence = (parts[i] + (parts[i+1] || "")).trim();
                if (sentence.length > 0) {
                    // 【關鍵】：立刻發送 Request，並帶上它應有的序號
                    this.fetchAndCache(sentence, this.sentenceCount);
                    this.sentenceCount++;
                }
            }
            this.sentenceBuffer = parts[parts.length - 1];
        }
    },

    flush: function() {
        const sentence = this.sentenceBuffer.trim();
        if (sentence.length > 0) {
            this.fetchAndCache(sentence, this.sentenceCount);
            this.sentenceCount++;
        }
        this.sentenceBuffer = "";
    },

    /**
     * 【並發下載】：不管別人，自己去下載並存入 Cache
     */
    fetchAndCache: async function(text, index) {
        {% raw %}
        const cleanText = text.replace(/\{\{%%img:[^%]+%%\}\}/g, '')
                              .replace(/https?:\/\/[^\s]+/g, '')
                              .replace(/[*#`]/g, '');
        {% endraw %}

        if (!cleanText.trim()) {
            // 如果是空句子，也要佔個位子讓播放器跳過
            this.audioCache[index] = "SKIP";
            this.tryPlay();
            return;
        }

        try {
            const response = await fetch('/ai/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText })
            });

            if (!response.ok) throw new Error("TTS failed");

            const blob = await response.blob();
            // 下載完成，存入對應的序號位子
            this.audioCache[index] = URL.createObjectURL(blob);

            // 下載完任何一個，都嘗試驅動播放器
            this.tryPlay();

        } catch (error) {
            console.error(`Index ${index} 下載失敗`, error);
            this.audioCache[index] = "SKIP"; // 失敗也佔位，避免後面的被卡死
            this.tryPlay();
        }
    },

    /**
     * 【順序播放】：檢查「下一個該播的」是否已經在 Cache 裡了
     */
    tryPlay: function() {
        // 如果正在播，或者「下一個要播的」還沒下載完，就繼續等
        if (this.isPlaying || !this.audioCache[this.nextIndexToPlay]) return;

        this.isPlaying = true;
        const currentData = this.audioCache[this.nextIndexToPlay];

        // 處理空句子或失敗的情況
        if (currentData === "SKIP") {
            this.finalizeStep();
            return;
        }

        this.currentAudio = new Audio(currentData);
        this.currentAudio.onended = () => {
            URL.revokeObjectURL(currentData);
            this.finalizeStep();
        };

        this.currentAudio.onerror = () => {
            this.finalizeStep();
        };

        this.currentAudio.play().catch(() => this.finalizeStep());
    },

    finalizeStep: function() {
        delete this.audioCache[this.nextIndexToPlay]; // 清理已播完的快取
        this.nextIndexToPlay++;                       // 指向下一句
        this.isPlaying = false;
        this.currentAudio = null;
        this.tryPlay();                               // 遞迴嘗試播下一句
    }
};

// 1. 訂閱「發送前」事件：清空上一句還沒念完的語音
streamHooks.preExecute.push((context) => {
    console.log("Hook 觸發：準備接收問題...", context.prompt);
    ttsEngine.reset();
    ttsEngine.feedText("你好，我了解您的意思了，讓我思考一下。");
    ttsEngine.flush();
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
