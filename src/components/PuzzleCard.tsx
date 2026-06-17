"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type StoredState = {
  lastDay: string;
  streak: number;
  totalSolved: number;
};

export function PuzzleCard() {
  const [state, setState] = useState<StoredState>({ lastDay: "", streak: 0, totalSolved: 0 });
  const [todayKey, setTodayKey] = useState("");

  useEffect(() => {
    const d = new Date();
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    setTodayKey(key);
    try {
      const raw = localStorage.getItem("xa.puzzle.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        setState({
          lastDay: parsed.lastDay ?? "",
          streak: parsed.streak ?? 0,
          totalSolved: parsed.totalSolved ?? 0,
        });
      }
    } catch { /* ignore */ }
  }, []);

  const solvedToday = state.lastDay === todayKey;

  return (
    <div className="card flex items-center justify-between gap-3 border-purple-500/30 transition-colors hover:border-purple-500/60">
      <Link href="/puzzle" className="flex items-center gap-3 flex-1">
        <span className="text-2xl">🧩</span>
        <div>
          <div className="text-sm font-semibold">
            Puzzle do Dia
            {solvedToday && <span className="ml-2 text-success">✓</span>}
          </div>
          <div className="text-[10px] text-muted">
            {solvedToday
              ? "Resolvido hoje — quer treinar mais?"
              : "Resolva o desafio tático de hoje e mantenha sua sequência."}
          </div>
        </div>
      </Link>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {state.streak > 0 && (
            <span className="badge-accent text-[10px]">🔥 {state.streak} dia{state.streak === 1 ? "" : "s"}</span>
          )}
          <Link
            href="/puzzle?random=1"
            className="rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300 transition-colors hover:bg-purple-500/20"
            title="Puzzle aleatório"
          >🎲</Link>
        </div>
        <span className="text-[10px] text-muted">{state.totalSolved} resolvidos</span>
      </div>
    </div>
  );
}
