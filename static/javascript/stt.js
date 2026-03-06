let activeRecognition = null;

/**
 * 語音轉文字引擎
 * @param {Function} result_callback - 成功取得文字後的回呼
 * @param {Function} [onstart] - 啟動時的 UI 勾子
 * @param {Function} [onend] - 結束時的 UI 勾子
 */
var stt = function(execute, preExecute = null, postExecute = null) {
    // i love webkit better :(
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;

    if (typeof preExecute === 'function') {
        recognition.onstart = preExecute;
    }

    if (typeof postExecute === 'function') {
        recognition.onend = postExecute;
    }

    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        execute(finalTranscript, interimTranscript);
    };

    recognition.start();
    return recognition;
};
