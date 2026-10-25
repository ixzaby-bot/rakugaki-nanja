// Speech is optional. Only an explicit user gesture calls start().
export class SpeechInput {
  constructor({ provider = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition, timeoutMs = 12000 } = {}) {
    this.provider = provider; this.timeoutMs = timeoutMs; this.recognition = null; this.timer = null;
  }
  get supported() { return !!this.provider(); }
  get active() { return !!this.recognition; }
  start({ onText, onState }) {
    if (this.active) return;
    const Recognition = this.provider();
    if (!Recognition) { onState(false, 'このブラウザでは音声入力が使えません。手入力してね。'); return; }
    let recognition;
    const finish = message => { this.cancel(); onState(false, message); };
    try {
      recognition = new Recognition(); this.recognition = recognition;
      recognition.lang = 'ja-JP'; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => {
        if (this.recognition !== recognition) return;
        const text = event.results?.[0]?.[0]?.transcript?.trim();
        if (text) { onText(Array.from(text).slice(0, 40).join('')); finish('聞き取れたよ。表記を確認してから決定してね。'); }
        else finish('聞き取れませんでした。そのまま手入力できるよ。');
      };
      recognition.onerror = event => {
        const messages = { 'not-allowed':'マイクを使えません。手入力で続けてね。', 'service-not-allowed':'音声サービスを使えません。手入力で続けてね。', 'audio-capture':'マイクが見つかりません。手入力で続けてね。', 'network':'音声認識に接続できません。手入力で続けてね。', 'no-speech':'声を聞き取れませんでした。手入力か、もう一度試してね。', 'aborted':'音声入力を中止しました。' };
        finish(messages[event.error] || '音声入力ができませんでした。手入力で続けてね。');
      };
      recognition.onend = () => { if (this.recognition === recognition) finish('聞き取れませんでした。手入力か、もう一度試してね。'); };
      this.stateCallback = onState; onState(true, '音声入力中… 名前を話してね。');
      recognition.start();
      if (this.active) this.timer = setTimeout(() => finish('時間がかかったため中止しました。手入力で続けてね。'), this.timeoutMs);
    } catch { finish('音声入力を開始できません。手入力で続けてね。'); }
  }
  cancel(message) {
    clearTimeout(this.timer); this.timer = null;
    const recognition = this.recognition; this.recognition = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
    if (message) this.stateCallback?.(false, message);
    this.stateCallback = null;
  }
}
