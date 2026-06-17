"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCoins, formatDate } from "@/lib/utils";

export type HistoryRow = {
  id: string;
  wager: number;
  status: "FINISHED" | "CANCELLED";
  result: string | null;
  winner_id: string | null;
  payout: number;
  move_count: number;
  white_user_id: string | null;
  black_user_id: string | null;
  time_control_seconds: number | null;
  time_increment_seconds: number;
  bot_difficulty: string | null;
  finished_at: string | null;
  created_at: string;
  white_user: { id: string; username: string } | null;
  black_user: { id: string; username: string } | null;
};

type ResultFilter  = "all" | "wins" | "losses" | "draws" | "cancelled";
type TCCategory    = "all" | "bullet" | "blitz" | "rapid" | "classical" | "untimed";
type OppFilter     = "all" | "humans" | "bots";

const RESULT_FILTERS: { value: ResultFilter; label: string; emoji: string }[] = [
  { value: "all",       label: "Todas",     emoji: "•" },
  { value: "wins",      label: "Vitórias",  emoji: "🏆" },
  { value: "losses",    label: "Derrotas",  emoji: "💀" },
  { value: "draws",     label: "Empates",   emoji: "🤝" },
  { value: "cancelled", label: "Cancelados", emoji: "✖" },
];
const TC_FILTERS: { value: TCCategory; label: string }[] = [
  { value: "all",       label: "Todos tempos" },
  { value: "bullet",    label: "Bullet (≤2min)" },
  { value: "blitz",     label: "Blitz (3-5min)" },
  { value: "rapid",     label: "Rápido (10-30min)" },
  { value: "classical", label: "Clássico (30min+)" },
  { value: "untimed",   label: "Sem tempo" },
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

export function HistoryClient({ matches, userId }: { matches: HistoryRow[]; userId: string }) {
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [tcFilter, setTcFilter] = useState<TCCategory>("all");
  const [oppFilter, setOppFilter] = useState<OppFilter>("all");

  const classified = useMemo(() => matches.map((m) => {
    const isWhite = m.white_user_id === userId;
    const opp = isWhite ? m.black_user : m.white_user;
    const isBot = m.bot_difficulty !== null;
    let kind: "win" | "loss" | "draw" | "cancelled";
    if (m.status === "CANCELLED") kind = "cancelled";
    else if (m.result?.includes("DRAW")) kind = "draw";
    else if (m.winner_id === userId) kind = "win";
    else kind = "loss";
    return { ...m, isWhite, opp, isBot, kind };
  }), [matches, userId]);

  const counts = useMemo(() => ({
    all:       classified.length,
    wins:      classified.filter((m) => m.kind === "win").length,
    losses:    classified.filter((m) => m.kind === "loss").length,
    draws:     classified.filter((m) => m.kind === "draw").length,
    cancelled: classified.filter((m) => m.kind === "cancelled").length,
  }), [classified]);

  const summary = useMemo(() => {
    let won = 0, lost = 0;
    for (const m of classified) {
      if (m.kind === "win")  won  += m.payout ?? 0;
      if (m.kind === "loss") lost += m.wager ?? 0;
    }
    const total = counts.wins + counts.losses + counts.draws;
    const winRate = total > 0 ? Math.round((counts.wins / total) * 100) : 0;
    return { netCoins: won - lost, winRate, total };
  }, [classified, counts]);

  const filtered = useMemo(() => {
    return classified.filter((m) => {
      if (resultFilter !== "all" && m.kind !== resultFilter.replace(/s$/, "") as typeof m.kind) {
        // wins → win, losses → loss, draws → draw
        const kindMap: Record<ResultFilter, string> = { all: "", wins: "win", losses: "loss", draws: "draw", cancelled: "cancelled" };
        if (m.kind !== kindMap[resultFilter]) return false;
      }
      if (!matchTC(m.time_control_seconds, tcFilter)) return false;
      if (oppFilter === "humans" && m.isBot) return false;
      if (oppFilter === "bots" && !m.isBot) return false;
      return true;
    });
  }, [classified, resultFilter, tcFilter, oppFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <div className="text-xs text-muted">
          Mostrando {filtered.length} de {classified.length}
        </div>
      </div>

      {/* Resumo agregado */}
      {classified.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryBox label="Partidas" value={summary.total.toString()} />
          <SummaryBox label="Win rate" value={`${summary.winRate}%`} tone={summary.winRate >= 50 ? "success" : "muted"} />
          <SummaryBox label="Vitórias" value={`${counts.wins}W ${counts.draws}E ${counts.losses}D`} />
          <SummaryBox label="Saldo" value={formatCoins(summary.netCoins)} tone={summary.netCoins >= 0 ? "success" : "danger"} />
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {RESULT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setResultFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                resultFilter === f.value
                  ? "border-accent bg-accent text-black font-medium"
                  : "border-border text-muted hover:border-accent/40 hover:text-white"
              }`}
            >
              {f.emoji} {f.label} <span className="opacity-60">({counts[f.value as keyof typeof counts] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select
            value={tcFilter}
            onChange={(e) => setTcFilter(e.target.value as TCCategory)}
            className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs"
          >
            {TC_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            value={oppFilter}
            onChange={(e) => setOppFilter(e.target.value as OppFilter)}
            className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs"
          >
            <option value="all">Todos oponentes</option>
            <option value="humans">Só humanos</option>
            <option value="bots">Só bots</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-muted">
          {classified.length === 0 ? (
            <>Nenhuma partida finalizada. Vá pro <Link href="/lobby" className="text-accent hover:underline">lobby</Link>.</>
          ) : (
            <>Nenhuma partida com esses filtros. Limpe os filtros pra ver mais.</>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            return (
              <li key={m.id} className="card flex items-center justify-between flex-wrap gap-2">
                <div className="min-w-0">
                  <div className="text-sm flex items-center gap-2 flex-wrap">
                    <span className="text-muted">vs</span>{" "}
                    <span className="font-semibold">@{m.opp?.username ?? (m.isBot ? "Bot" : "?")}</span>
                    <span className="text-xs text-muted">({m.isWhite ? "Brancas" : "Pretas"})</span>
                    {m.isBot && <span className="badge text-[10px]">🤖 Bot</span>}
                    <span className="badge text-[10px]">⏱ {formatTC(m.time_control_seconds, m.time_increment_seconds)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(m.finished_at ?? m.created_at)} • {m.move_count} lances • aposta {formatCoins(m.wager)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {m.kind === "cancelled" ? (
                    <span className="badge">Cancelada</span>
                  ) : m.kind === "draw" ? (
                    <span className="badge">Empate</span>
                  ) : m.kind === "win" ? (
                    <span className="badge-success">Vitória +{formatCoins(m.payout)}</span>
                  ) : (
                    <span className="badge-danger">Derrota -{formatCoins(m.wager)}</span>
                  )}
                  <Link href={`/match/${m.id}`} className="text-xs text-accent hover:underline">rever</Link>
                  {m.kind !== "cancelled" && !m.isBot && (
                    <Link href={`/match/${m.id}/review`} className="text-xs text-accent hover:underline">análise</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "muted" }) {
  const c = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div className="card py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 text-base font-bold ${c}`}>{value}</div>
    </div>
  );
}
