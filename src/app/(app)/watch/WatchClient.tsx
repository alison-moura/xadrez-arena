"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { formatCoins } from "@/lib/utils";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Match = {
  id: string;
  wager: number;
  status: string;
  created_at: string;
  fen: string;
  turn: string;
  move_count: number;
  time_control_seconds: number | null;
  time_increment_seconds: number;
  white_time_ms: number | null;
  black_time_ms: number | null;
  last_move_at: string | null;
  white_user: { id: string; username: string; rating: number } | null;
  black_user: { id: string; username: string; rating: number } | null;
};

type TCCategory = "all" | "bullet" | "blitz" | "rapid" | "classical" | "untimed";
const TC_FILTERS: { value: TCCategory; label: string; emoji: string }[] = [
  { value: "all",       label: "Todas",     emoji: "•" },
  { value: "bullet",    label: "Bullet",    emoji: "⚡" },
  { value: "blitz",     label: "Blitz",     emoji: "🔥" },
  { value: "rapid",     label: "Rápido",    emoji: "🏃" },
  { value: "classical", label: "Clássico",  emoji: "🐢" },
  { value: "untimed",   label: "Sem tempo", emoji: "∞" },
];

function matchTC(sec: number | null, cat: TCCategory): boolean {
  if (cat === "all") return true;
  if (cat === "untimed") return sec === null;
  if (sec === null) return false;
  if (cat === "bullet")    return sec <= 120;
  if (cat === "blitz")     return sec > 120 && sec <= 300;
  if (cat === "rapid")     return sec > 300 && sec <= 1800;
  if (cat === "classical") return sec > 1800;
  return true;
}

function formatTC(sec: number | null, inc: number): string {
  if (sec === null) return "∞";
  return `${Math.round(sec / 60)}${inc > 0 ? `+${inc}` : ""}`;
}

function formatClock(ms: number | null): string {
  if (ms === null || ms === undefined) return "∞";
  const safe = Math.max(0, ms);
  const total = Math.floor(safe / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WatchClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [tcFilter, setTcFilter] = useState<TCCategory>("all");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/matches?status=ACTIVE");
    if (!res.ok) return;
    const data = await res.json();
    setMatches(data.matches ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(
    () => matches.filter((m) => matchTC(m.time_control_seconds, tcFilter)),
    [matches, tcFilter]
  );

  function liveTime(m: Match, color: "w" | "b"): number | null {
    if (m.time_control_seconds === null) return null;
    const base = (color === "w" ? m.white_time_ms : m.black_time_ms) ?? m.time_control_seconds * 1000;
    if (!m.last_move_at || m.turn !== color) return base;
    const elapsed = Math.max(0, now - new Date(m.last_move_at).getTime());
    return Math.max(0, base - elapsed);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Assistir</h1>
          <p className="text-xs text-muted">
            {loading ? "Carregando…" : `${filtered.length} partida${filtered.length !== 1 ? "s" : ""} ao vivo`}
          </p>
        </div>
        <Link href="/lobby" className="btn-secondary text-xs">← Lobby</Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {TC_FILTERS.map((f) => {
          const count = f.value === "all"
            ? matches.length
            : matches.filter((m) => matchTC(m.time_control_seconds, f.value)).length;
          return (
            <button
              key={f.value}
              onClick={() => setTcFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                tcFilter === f.value
                  ? "border-accent bg-accent text-black font-medium"
                  : "border-border text-muted hover:border-accent/40 hover:text-white"
              }`}
            >
              {f.emoji} {f.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="card py-12 text-center text-muted">
          <div className="mb-2 text-3xl opacity-30">♟</div>
          <p className="text-sm">Nenhuma partida ao vivo neste formato.</p>
          <p className="text-xs">Vá pro <Link href="/lobby" className="text-accent hover:underline">lobby</Link> e crie a sua!</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => {
          const wTime = liveTime(m, "w");
          const bTime = liveTime(m, "b");
          return (
            <Link
              key={m.id}
              href={`/match/${m.id}`}
              className="card flex flex-col gap-2 transition-transform hover:-translate-y-0.5 hover:border-accent/40"
            >
              {/* Top player */}
              <PlayerLine
                user={m.black_user}
                color="b"
                clockMs={bTime}
                hasClock={m.time_control_seconds !== null}
                isTurn={m.turn === "b"}
              />
              {/* Board */}
              <div className="rounded-lg overflow-hidden">
                <Chessboard
                  position={m.fen}
                  arePiecesDraggable={false}
                  showBoardNotation={false}
                  customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
                  customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
                />
              </div>
              {/* Bottom player */}
              <PlayerLine
                user={m.white_user}
                color="w"
                clockMs={wTime}
                hasClock={m.time_control_seconds !== null}
                isTurn={m.turn === "w"}
              />
              {/* Stats */}
              <div className="flex items-center justify-between text-[10px] text-muted pt-1">
                <span>⏱ {formatTC(m.time_control_seconds, m.time_increment_seconds)}</span>
                <span>{m.move_count} lances</span>
                <span className="text-accent">{formatCoins(m.wager * 2)} pot</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PlayerLine({
  user, color, clockMs, hasClock, isTurn,
}: {
  user: { username: string; rating: number } | null;
  color: "w" | "b";
  clockMs: number | null;
  hasClock: boolean;
  isTurn: boolean;
}) {
  const low = hasClock && isTurn && (clockMs ?? Infinity) < 30_000;
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
      isTurn ? "bg-accent/10 ring-1 ring-accent/30" : "bg-surfaceAlt"
    }`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-base">{color === "w" ? "♔" : "♚"}</span>
        <span className="font-semibold truncate">@{user?.username ?? "?"}</span>
        <span className="text-muted">{user?.rating}</span>
      </div>
      {hasClock && (
        <span className={`font-mono tabular-nums ${low ? "animate-pulse text-danger" : isTurn ? "text-accent" : "text-muted"}`}>
          {formatClock(clockMs)}
        </span>
      )}
    </div>
  );
}
