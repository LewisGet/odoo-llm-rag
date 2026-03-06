var input_text = document.getElementById("userInput");
var record_button = document.getElementById("recordButton");

let current_rec = null;
let silence_timer = null;

record_button.onclick = function() {
    // 點第二下直接關閉 (UI 邏輯)
    if (current_rec) {
        current_rec.stop();
        current_rec = null;
        return;
    }

    let saved_text = input_text.value;

    current_rec = stt(
        // execute
        (final, interim) => {
            input_text.value = saved_text + final + interim;
            if (final !== "") saved_text += final;

            // 靜默兩秒自動關閉 (UI 邏輯)
            if (silence_timer) clearTimeout(silence_timer);
            silence_timer = setTimeout(() => {
                if (current_rec) {
                    current_rec.stop();
                    current_rec = null;
                }
            }, 2000);
        },
        // preExecute (UI 提示)
        () => {
            record_button.classList.add("recording");
            record_button.innerText = "聆聽中...";
        },
        // postExecute (UI 恢復)
        () => {
            record_button.classList.remove("recording");
            record_button.innerText = "按下錄音";
            if (silence_timer) clearTimeout(silence_timer);
        }
    );
};