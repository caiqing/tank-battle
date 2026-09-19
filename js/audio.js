/* ══════════════════════════════════════════════
   audio.js — WebAudio 实时合成音效（无外部资源）
   ══════════════════════════════════════════════ */
"use strict";

const SFX = {
  ctx: null,
  master: null,
  muted: false,
  lastPlay: {},   // 同类音效节流

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.42;
  },

  _gate(name, minGapMs) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGapMs) return false;
    this.lastPlay[name] = now;
    return true;
  },

  /* 噪声脉冲（爆炸/枪声的基础） */
  _noise(dur, freq, vol, type = "lowpass") {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  },

  /* 单音（提示音的基础） */
  _tone(freq, dur, vol, type = "square", slide = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  },

  /* —— 游戏音效 —— */
  shoot()   { if (!this.ctx || !this._gate("shoot", 40))  return; this._noise(0.14, 900, 0.5); this._tone(180, 0.1, 0.25, "square", -80); },
  mg()      { if (!this.ctx || !this._gate("mg", 30))     return; this._noise(0.05, 2400, 0.3, "highpass"); },
  missile() { if (!this.ctx || !this._gate("ms", 100))    return; this._noise(0.3, 600, 0.4); this._tone(320, 0.28, 0.16, "sawtooth", 220); },
  hit()     { if (!this.ctx || !this._gate("hit", 50))    return; this._tone(1150, 0.05, 0.14, "square", -300); },
  brick()   { if (!this.ctx || !this._gate("brick", 60))  return; this._noise(0.12, 500, 0.3); },
  explode(big) {
    if (!this.ctx || !this._gate("ex", 60)) return;
    this._noise(big ? 0.65 : 0.35, big ? 380 : 620, big ? 0.85 : 0.55);
    this._tone(big ? 70 : 110, big ? 0.4 : 0.2, 0.3, "triangle", -40);
  },
  pickup()  { if (!this.ctx) return; this._tone(660, 0.08, 0.2, "sine"); setTimeout(() => this.ctx && this._tone(990, 0.12, 0.2, "sine"), 70); },
  buy()     { if (!this.ctx) return; this._tone(520, 0.09, 0.22, "triangle"); setTimeout(() => this.ctx && this._tone(780, 0.14, 0.22, "triangle"), 90); },
  deny()    { if (!this.ctx) return; this._tone(180, 0.16, 0.22, "square", -60); },
  click()   { if (!this.ctx) return; this._tone(820, 0.045, 0.12, "square"); },
  wave()    { if (!this.ctx) return; this._tone(392, 0.14, 0.2, "triangle"); setTimeout(() => this.ctx && this._tone(523, 0.18, 0.2, "triangle"), 130); },
  win() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.ctx && this._tone(f, 0.22, 0.24, "triangle"), i * 140));
  },
  lose() {
    if (!this.ctx) return;
    [392, 311, 262, 196].forEach((f, i) => setTimeout(() => this.ctx && this._tone(f, 0.3, 0.24, "sawtooth"), i * 170));
  },
};
