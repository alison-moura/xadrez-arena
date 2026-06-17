"use client";
// Sons sintetizados via Web Audio API — zero assets, zero rede.
// Estilo Lichess: tom curto, percussivo, agradável.

export type SoundKind =
  | "move"        // lance comum
  | "capture"     // captura
  | "check"       // xeque
  | "castle"      // roque
  | "promote"     // promoção
  | "start"       // início da partida
  | "winSelf"     // vitória própria
  | "loseSelf"    // derrota / oponente venceu
  | "draw"        // empate
  | "lowTime"     // alerta de tempo curto
  | "notify"      // chat / oferta de empate
  | "click";      // UI feedback

export type SoundPack = "classic" | "futuristic" | "soft";

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
let pack: SoundPack | null = null;

export function getPack(): SoundPack {
  if (typeof window === "undefined") return "classic";
  if (pack !== null) return pack;
  try {
    const v = localStorage.getItem("xa.soundPack");
    pack = (v === "futuristic" || v === "soft") ? v : "classic";
  } catch { pack = "classic"; }
  return pack;
}

export function setPack(p: SoundPack) {
  pack = p;
  try { localStorage.setItem("xa.soundPack", p); } catch { /* ignore */ }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch { return null; }
  }
  // Browsers exigem retomar o contexto após gesto do usuário
  if (ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  if (muted !== null) return muted;
  try { muted = localStorage.getItem("xa.muted") === "1"; } catch { muted = false; }
  return muted!;
}

export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem("xa.muted", v ? "1" : "0"); } catch { /* ignore */ }
}

function blip(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  decay?: number;
  gain?: number;
  freqEnd?: number;
}) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, c.currentTime);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.freqEnd),
      c.currentTime + opts.duration
    );
  }
  const peak = opts.gain ?? 0.18;
  const att  = opts.attack ?? 0.005;
  const dec  = opts.decay ?? opts.duration;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + att);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + att + dec);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + att + dec + 0.05);
}

function noise(opts: { duration: number; gain?: number; lpHz?: number }) {
  const c = getCtx();
  if (!c) return;
  const bufSize = Math.floor(c.sampleRate * opts.duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const peak = opts.gain ?? 0.18;
  g.gain.setValueAtTime(peak, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + opts.duration);
  if (opts.lpHz) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.lpHz;
    src.connect(lp).connect(g).connect(c.destination);
  } else {
    src.connect(g).connect(c.destination);
  }
  src.start();
  src.stop(c.currentTime + opts.duration + 0.02);
}

export function play(kind: SoundKind) {
  if (isMuted()) return;
  const p = getPack();
  if (p === "futuristic") return playFuturistic(kind);
  if (p === "soft")       return playSoft(kind);
  return playClassic(kind);
}

function playClassic(kind: SoundKind) {
  switch (kind) {
    case "move":
      blip({ freq: 260, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 });
      break;
    case "capture":
      noise({ duration: 0.08, gain: 0.20, lpHz: 2200 });
      blip({ freq: 180, freqEnd: 90, duration: 0.10, type: "sawtooth", gain: 0.14 });
      break;
    case "check":
      blip({ freq: 660,  duration: 0.09, type: "sine", gain: 0.20 });
      setTimeout(() => blip({ freq: 990, duration: 0.10, type: "sine", gain: 0.22 }), 70);
      break;
    case "castle":
      blip({ freq: 240, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 });
      setTimeout(() => blip({ freq: 240, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 }), 80);
      break;
    case "promote":
      [440, 554, 659, 880].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.08, type: "sine", gain: 0.18 }), i * 55)
      );
      break;
    case "start":
      blip({ freq: 440, duration: 0.10, type: "sine", gain: 0.18 });
      setTimeout(() => blip({ freq: 660, duration: 0.12, type: "sine", gain: 0.20 }), 80);
      break;
    case "winSelf":
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.15, type: "sine", gain: 0.22 }), i * 90)
      );
      break;
    case "loseSelf":
      blip({ freq: 330, freqEnd: 110, duration: 0.55, type: "sawtooth", gain: 0.18 });
      break;
    case "draw":
      blip({ freq: 440, duration: 0.12, type: "sine", gain: 0.18 });
      setTimeout(() => blip({ freq: 440, duration: 0.18, type: "sine", gain: 0.16 }), 130);
      break;
    case "lowTime":
      blip({ freq: 900, duration: 0.06, type: "square", gain: 0.16 });
      break;
    case "notify":
      blip({ freq: 880, duration: 0.10, type: "triangle", gain: 0.18 });
      break;
    case "click":
      blip({ freq: 520, duration: 0.03, type: "square", gain: 0.10 });
      break;
  }
}

function playFuturistic(kind: SoundKind) {
  switch (kind) {
    case "move":
      blip({ freq: 880, freqEnd: 660, duration: 0.05, type: "sine", gain: 0.12 });
      break;
    case "capture":
      blip({ freq: 1320, freqEnd: 220, duration: 0.12, type: "sawtooth", gain: 0.14 });
      noise({ duration: 0.05, gain: 0.10, lpHz: 4000 });
      break;
    case "check":
      blip({ freq: 1320, duration: 0.05, type: "square", gain: 0.18 });
      setTimeout(() => blip({ freq: 1760, duration: 0.06, type: "square", gain: 0.20 }), 40);
      setTimeout(() => blip({ freq: 2200, duration: 0.08, type: "square", gain: 0.20 }), 80);
      break;
    case "castle":
      blip({ freq: 660, freqEnd: 990, duration: 0.10, type: "sine", gain: 0.15 });
      break;
    case "promote":
      [660, 990, 1320, 1760].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.06, type: "sine", gain: 0.16 }), i * 40)
      );
      break;
    case "start":
      blip({ freq: 440, freqEnd: 880, duration: 0.20, type: "sine", gain: 0.18 });
      break;
    case "winSelf":
      [880, 1100, 1320, 1760].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.15, type: "sine", gain: 0.20 }), i * 80)
      );
      break;
    case "loseSelf":
      blip({ freq: 220, freqEnd: 55, duration: 0.6, type: "square", gain: 0.16 });
      break;
    case "draw":
      blip({ freq: 660, duration: 0.10, type: "sine", gain: 0.16 });
      setTimeout(() => blip({ freq: 660, duration: 0.16, type: "sine", gain: 0.15 }), 120);
      break;
    case "lowTime":
      blip({ freq: 1760, duration: 0.04, type: "sawtooth", gain: 0.18 });
      break;
    case "notify":
      blip({ freq: 1100, duration: 0.06, type: "sine", gain: 0.16 });
      setTimeout(() => blip({ freq: 1320, duration: 0.08, type: "sine", gain: 0.18 }), 50);
      break;
    case "click":
      blip({ freq: 1320, duration: 0.02, type: "square", gain: 0.08 });
      break;
  }
}

function playSoft(kind: SoundKind) {
  switch (kind) {
    case "move":
      blip({ freq: 220, freqEnd: 180, duration: 0.10, type: "sine", gain: 0.12 });
      break;
    case "capture":
      blip({ freq: 160, freqEnd: 100, duration: 0.16, type: "sine", gain: 0.16 });
      break;
    case "check":
      blip({ freq: 520, duration: 0.18, type: "sine", gain: 0.14 });
      break;
    case "castle":
      blip({ freq: 240, freqEnd: 200, duration: 0.10, type: "sine", gain: 0.14 });
      setTimeout(() => blip({ freq: 240, freqEnd: 200, duration: 0.10, type: "sine", gain: 0.12 }), 100);
      break;
    case "promote":
      [440, 554, 659].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.12, type: "sine", gain: 0.14 }), i * 80)
      );
      break;
    case "start":
      blip({ freq: 440, duration: 0.18, type: "sine", gain: 0.14 });
      break;
    case "winSelf":
      [523, 659, 784].forEach((f, i) =>
        setTimeout(() => blip({ freq: f, duration: 0.20, type: "sine", gain: 0.16 }), i * 130)
      );
      break;
    case "loseSelf":
      blip({ freq: 330, freqEnd: 165, duration: 0.45, type: "sine", gain: 0.14 });
      break;
    case "draw":
      blip({ freq: 440, duration: 0.18, type: "sine", gain: 0.14 });
      break;
    case "lowTime":
      blip({ freq: 720, duration: 0.10, type: "sine", gain: 0.12 });
      break;
    case "notify":
      blip({ freq: 660, duration: 0.14, type: "sine", gain: 0.12 });
      break;
    case "click":
      blip({ freq: 440, duration: 0.04, type: "sine", gain: 0.08 });
      break;
  }
}
