"use client";
// Cliente Stockfish 18 WASM (single-threaded) que roda inteiramente no browser.
// Carrega via Worker quando o usuário pede a análise — não pesa o bundle inicial.

export type EvalResult = { cp: number; mate: number | null };

interface StockfishWorkerLike {
  postMessage(msg: string): void;
  terminate(): void;
  addEventListener(ev: "message", cb: (e: MessageEvent) => void): void;
  removeEventListener(ev: "message", cb: (e: MessageEvent) => void): void;
}

let cached: StockfishClient | null = null;

export function getStockfish(): StockfishClient {
  if (!cached) cached = new StockfishClient();
  return cached;
}

class StockfishClient {
  private worker: StockfishWorkerLike | null = null;
  private ready = false;
  private waitForReady: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    this.waitForReady = new Promise<void>((r) => { this.resolveReady = r; });
  }

  private ensureWorker() {
    if (this.worker) return;
    // O caminho é relativo a /public — o WASM é carregado pelo próprio worker.
    this.worker = new Worker("/stockfish/stockfish-18-lite-single.js") as unknown as StockfishWorkerLike;
    this.worker.addEventListener("message", (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : "";
      if (!line) return;
      if (line === "uciok") {
        this.worker?.postMessage("isready");
        return;
      }
      if (line === "readyok") {
        if (!this.ready) {
          this.ready = true;
          this.resolveReady();
        }
      }
    });
    this.worker.postMessage("uci");
  }

  async init(): Promise<void> {
    this.ensureWorker();
    await this.waitForReady;
  }

  /**
   * Avalia uma posição FEN até a profundidade indicada.
   * Retorna o score em centipawns do ponto de vista do lado que está pra mover
   * (positivo = mover está ganhando). Para mate, retorna ±10000.
   */
  async evaluate(fen: string, depth = 12): Promise<EvalResult> {
    const r = await this.evaluateFull(fen, depth);
    return { cp: r.cp, mate: r.mate };
  }

  /**
   * Como evaluate, mas também retorna o melhor lance em UCI (ex.: "e2e4").
   */
  async evaluateFull(fen: string, depth = 12): Promise<EvalResult & { bestUci: string | null }> {
    await this.init();
    if (!this.worker) return { cp: 0, mate: null, bestUci: null };

    return new Promise<EvalResult & { bestUci: string | null }>((resolve) => {
      let cp = 0;
      let mate: number | null = null;
      let bestUci: string | null = null;

      const onMsg = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : "";
        if (!line) return;
        if (line.startsWith("info") && line.includes("score")) {
          const m = line.match(/score mate (-?\d+)/);
          if (m) {
            mate = parseInt(m[1], 10);
            cp = mate > 0 ? 10000 : -10000;
          } else {
            const c = line.match(/score cp (-?\d+)/);
            if (c) {
              cp = parseInt(c[1], 10);
              mate = null;
            }
          }
        }
        if (line.startsWith("bestmove")) {
          const parts = line.split(/\s+/);
          if (parts[1] && parts[1] !== "(none)") bestUci = parts[1];
          this.worker?.removeEventListener("message", onMsg);
          resolve({ cp, mate, bestUci });
        }
      };

      this.worker?.addEventListener("message", onMsg);
      this.worker?.postMessage("ucinewgame");
      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(`go depth ${depth}`);
    });
  }

  terminate() {
    if (this.worker) {
      try { this.worker.terminate(); } catch { /* ignore */ }
      this.worker = null;
      this.ready = false;
      this.waitForReady = new Promise<void>((r) => { this.resolveReady = r; });
    }
  }
}
