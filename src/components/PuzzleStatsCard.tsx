"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Stats {
  totalSolved: number;
  totalAttempts: number;
  streak: number;
  lastDay: string;
  loaded: boolean;
}

export function PuzzleStatsCard() {
  const [s, setS] = useState<Stats>({ totalSolved: 0, totalAttempts: 0, streak: 0, lastDay: "", loaded: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("xa.puzzle.v1");
      if (!raw) { setS((p) => ({ ...p, loaded: true })); return; }
      const j = JSON.parse(raw);
      setS({
        totalSolved:   j.totalSolved ?? 0,
        totalAttempts: j.totalAttempts ?? 0,
        streak:        j.streak ?? 0,
        lastDay:       j.lastDay ?? "",
        loaded:        true,
      });
    } catch {
      setS((p) => ({ ...p, loaded: true }));
    }
  }, []);

  if (!s.loaded) return null;
  if (s.totalAttempts === 0) {
    return (
      <Link href="/puzzle" className="card flex items-center justify-between border-purple-500/20 transition-colors hover:border-purple-500/50">
        <div>
          <div className="text-sm font-semibold">🧩 Treinar com puzzles</div>
          <div className="text-[11px] text-muted">Ainda não resolveu nenhum — comece agora!</div>
        </div>
        <span className="badge-accent text-[10px]">Ir →</span>
      </Link>
    );
  }
  const accuracy = s.totalAttempts > 0 ? Math.round((s.totalSolved / s.totalAttempts) * 100) : 0;

  return (
    <Link href="/puzzle" className="card transition-colors hover:border-purple-500/50">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">🧩 Puzzles</h2>
        <span className="text-[10px] text-muted hover:text-accent">treinar →</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Resolvidos" value={s.totalSolved} />
        <Stat label="Tentativas" value={s.totalAttempts} />
        <Stat label="Sequência" value={s.streak} suffix={s.streak > 0 ? "🔥" : undefined} />
        <Stat label="Acerto" value={`${accuracy}%`} />
      </div>
    </Link>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surfaceAlt/40 px-2 py-2">
      <div className="text-base font-bold text-white">
        {value}{suffix && <span className="ml-1 text-sm">{suffix}</span>}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
