"use client";
import { useEffect, useState } from "react";

type State =
  | { kind: "loading" }
  | { kind: "claimable"; streak: number }
  | { kind: "claimed";   streak: number; amount?: number }
  | { kind: "off" };

export function DailyBonusBanner() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/daily-bonus")
      .then((r) => r.json())
      .then((d) => {
        if (d?.canClaim) setState({ kind: "claimable", streak: d.streak ?? 0 });
        else setState({ kind: "off" });
      })
      .catch(() => setState({ kind: "off" }));
  }, []);

  async function claim() {
    const res = await fetch("/api/daily-bonus", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d?.claimed) {
      setState({ kind: "claimed", streak: d.streak ?? 1, amount: d.amount });
      setTimeout(() => setState({ kind: "off" }), 8000);
    }
  }

  if (state.kind === "off" || state.kind === "loading") return null;

  if (state.kind === "claimable") {
    const nextAmount = Math.min(200, 20 + state.streak * 10);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-gradient-to-r from-accent/10 to-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <div>
            <div className="text-sm font-semibold">Seu bônus diário está disponível!</div>
            <div className="text-[10px] text-muted">
              {state.streak > 0 ? <>Streak atual: <span className="text-accent">🔥 {state.streak}</span> dia{state.streak !== 1 ? "s" : ""} · </> : ""}
              ganhe <span className="text-accent font-semibold">{nextAmount} coins</span> agora
            </div>
          </div>
        </div>
        <button onClick={claim} className="btn-primary py-1.5 text-xs">Resgatar</button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-success/40 bg-success/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-success">
        <span className="text-xl">🎉</span>
        <span>
          +{state.amount ?? 0} coins resgatados! Streak: 🔥 {state.streak}
        </span>
      </div>
    </div>
  );
}
