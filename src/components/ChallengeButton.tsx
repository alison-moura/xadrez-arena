"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCoins } from "@/lib/utils";

const TIME_PRESETS: { label: string; tc: number | null; inc: number }[] = [
  { label: "1 min",  tc: 60,   inc: 0 },
  { label: "3 min",  tc: 180,  inc: 0 },
  { label: "5+3",    tc: 300,  inc: 3 },
  { label: "10 min", tc: 600,  inc: 0 },
  { label: "Sem tempo", tc: null, inc: 0 },
];

const WAGER_PRESETS = [0, 25, 50, 100, 250];

export function ChallengeButton({
  username,
  compact = false,
}: {
  username: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wager, setWager] = useState(0);
  const [timeIdx, setTimeIdx] = useState(2); // 5+3
  const [color, setColor] = useState<"w" | "b" | "random">("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const preset = TIME_PRESETS[timeIdx];
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wager,
        preferredColor: color,
        ratingRange: "open",
        timeControlSeconds: preset.tc,
        timeIncrementSeconds: preset.inc,
        challengedUsername: username,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao desafiar");
      return;
    }
    router.push(`/match/${data.matchId}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          compact
            ? "rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent/20"
            : "btn-primary shrink-0 text-xs"
        }
      >
        ⚔️ Desafiar
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-accent/40 bg-surface p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">⚔️ Desafiar @{username}</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-white">✕</button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="label">Tempo</div>
          <div className="flex flex-wrap gap-1">
            {TIME_PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setTimeIdx(i)}
                className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                  timeIdx === i ? "border-accent bg-accent/20 text-accent" : "border-border text-muted hover:border-accent/40"
                }`}
              >{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Aposta</div>
          <div className="flex flex-wrap gap-1">
            {WAGER_PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setWager(v)}
                className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                  wager === v ? "border-accent bg-accent/20 text-accent" : "border-border text-muted hover:border-accent/40"
                }`}
              >{v === 0 ? "Amistoso" : formatCoins(v)}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Sua cor</div>
          <div className="grid grid-cols-3 gap-1">
            {(["w", "random", "b"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                  color === c ? "border-accent bg-accent/20 text-accent" : "border-border text-muted hover:border-accent/40"
                }`}
              >{c === "w" ? "♔ Brancas" : c === "b" ? "♚ Pretas" : "🎲 Aleatório"}</button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button onClick={send} disabled={busy} className="btn-primary w-full text-sm">
          {busy ? "Enviando…" : `Enviar desafio${wager ? ` · ${formatCoins(wager)} coins` : ""}`}
        </button>
        <p className="text-[10px] text-muted">
          O desafio aparece no lobby do @{username}. Se ele recusar, sua aposta volta.
        </p>
      </div>
    </div>
  );
}
