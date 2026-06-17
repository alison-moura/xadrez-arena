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

let ctx: AudioContext | null = null;
let muted: boolean | null = null;

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
  switch (kind) {
    case "move":
      // thump curto, baixo
      blip({ freq: 260, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 });
      break;
    case "capture":
      // estalo: noise + tom curto
      noise({ duration: 0.08, gain: 0.20, lpHz: 2200 });
      blip({ freq: 180, freqEnd: 90, duration: 0.10, type: "sawtooth", gain: 0.14 });
      break;
    case "check":
      // duplo tom ascendente, atenção
      blip({ freq: 660,  duration: 0.09, type: "sine", gain: 0.20 });
      setTimeout(() => blip({ freq: 990, duration: 0.10, type: "sine", gain: 0.22 }), 70);
      break;
    case "castle":
      // dois thumps separados
      blip({ freq: 240, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 });
      setTimeout(() => blip({ freq: 240, freqEnd: 160, duration: 0.07, type: "triangle", gain: 0.18 }), 80);
      break;
    case "promote":
      // arpejo ascendente
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
