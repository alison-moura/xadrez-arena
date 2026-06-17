// Token-bucket in-memory rate limiter. Suficiente para um único processo Next.js.
// Em deploy multi-instância, trocar por Upstash/Redis com a mesma interface.

type Bucket = { tokens: number; refilledAt: number };
const buckets = new Map<string, Bucket>();

interface LimitOptions {
  /** Max tokens (≈ requests permitidas em uma rajada) */
  capacity: number;
  /** Tokens recarregados por segundo */
  refillPerSecond: number;
}

export interface LimitResult {
  ok: boolean;
  /** Tokens disponíveis após o consumo */
  remaining: number;
  /** ms até a próxima recarga total */
  retryAfterMs: number;
}

export function rateLimit(key: string, opts: LimitOptions): LimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, refilledAt: now };
    buckets.set(key, b);
  }
  const elapsedSec = (now - b.refilledAt) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSecond);
    b.refilledAt = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), retryAfterMs: 0 };
  }
  const need = 1 - b.tokens;
  const retryAfterMs = Math.ceil((need / opts.refillPerSecond) * 1000);
  return { ok: false, remaining: 0, retryAfterMs };
}

export function clientKey(req: Request, userId: string | null, scope: string): string {
  // Usa headers do proxy quando disponível; cai pra unknown se não houver.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${userId ?? ip}`;
}

// GC periódico para não vazar memória em rotas obscuras
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, b] of buckets) if (b.refilledAt < cutoff && b.tokens >= 1) buckets.delete(k);
}, 60_000).unref?.();
