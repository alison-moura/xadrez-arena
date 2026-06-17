"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCoins } from "@/lib/utils";
import { CountdownTimer } from "@/components/CountdownTimer";

type Player = {
  user_id: string;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  joined_at: string;
  user: { id: string; username: string; rating: number } | null;
};

type Tournament = {
  id: string;
  name: string;
  description: string | null;
  status: "SCHEDULED" | "ACTIVE" | "FINISHED" | "CANCELLED";
  starts_at: string;
  ends_at: string;
  time_control_seconds: number;
  time_increment_seconds: number;
  entry_fee: number;
  prize_pool: number;
};

function formatTC(sec: number, inc: number): string {
  return `${Math.round(sec / 60)}${inc > 0 ? `+${inc}` : ""}`;
}

export function TournamentDetailClient({ id }: { id: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTournament(data.tournament);
    setPlayers(data.players ?? []);
    setJoined(data.joined ?? false);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function joinNow() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${id}/join`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await load();
  }

  if (loading || !tournament) {
    return <div className="card py-12 text-center text-sm text-muted">Carregando…</div>;
  }

  const isActive = tournament.status === "ACTIVE";
  const isFinished = tournament.status === "FINISHED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/tournaments" className="text-xs text-muted hover:text-white">← Todos os torneios</Link>
      </div>

      {/* Hero */}
      <div className={`card ${isActive ? "border-accent/40" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{tournament.name}</h1>
              {isActive && <span className="badge-accent text-[10px]">ao vivo</span>}
              {isFinished && <span className="badge-success text-[10px]">encerrado</span>}
            </div>
            {tournament.description && (
              <p className="mt-2 text-sm text-muted">{tournament.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="badge">⏱ {formatTC(tournament.time_control_seconds, tournament.time_increment_seconds)}</span>
              <span className="badge">👥 {players.length} inscrito{players.length !== 1 ? "s" : ""}</span>
              {tournament.entry_fee > 0 ? (
                <span className="badge">💸 entrada {formatCoins(tournament.entry_fee)}</span>
              ) : (
                <span className="badge-success">grátis</span>
              )}
              {isActive && (
                <CountdownTimer endsAt={tournament.ends_at} prefix="⏳ encerra em" className="text-xs" />
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted">Prize pool</div>
            <div className="text-2xl font-bold text-accent">{formatCoins(tournament.prize_pool)}</div>
            {!joined && !isFinished && (
              <button
                onClick={joinNow}
                disabled={busy}
                className="btn-primary mt-2 text-sm"
              >{busy ? "Inscrevendo…" : "Inscrever-se"}</button>
            )}
            {joined && <span className="badge-success mt-2 inline-block text-[10px]">✓ você está inscrito</span>}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Leaderboard */}
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Classificação</h2>
        {players.length === 0 ? (
          <p className="text-xs text-muted">Ninguém inscrito ainda. Seja o primeiro!</p>
        ) : (
          <ol className="space-y-1">
            {players.map((p, i) => {
              const isPrize = i < 3 && tournament.prize_pool > 0;
              const share = isPrize
                ? Math.floor(tournament.prize_pool * (i === 0 ? 0.6 : i === 1 ? 0.25 : 0.15))
                : 0;
              return (
                <li
                  key={p.user_id}
                  className={`flex items-center gap-3 rounded px-2 py-1.5 ${
                    i === 0 ? "bg-accent/15" : i < 3 ? "bg-surfaceAlt" : "hover:bg-surfaceAlt/50"
                  }`}
                >
                  <span className={`w-6 text-center font-mono text-sm ${i === 0 ? "text-accent font-bold" : "text-muted"}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">@{p.user?.username ?? "?"}</span>
                      <span className="text-[10px] text-muted">{p.user?.rating}</span>
                      {p.streak > 2 && <span className="text-[10px] text-accent">🔥 {p.streak}</span>}
                    </div>
                    <div className="text-[10px] text-muted">
                      {p.wins}V {p.draws}E {p.losses}D
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{p.score} pts</div>
                    {isPrize && <div className="text-[10px] text-accent">{formatCoins(share)} se mantém</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* How tournaments work nudge */}
      {!isFinished && (
        <div className="card border-accent/30">
          <p className="text-xs text-muted">
            Para pontuar, crie ou entre em partidas com o time control{" "}
            <strong className="text-white">{formatTC(tournament.time_control_seconds, tournament.time_increment_seconds)}</strong>{" "}
            no <Link href="/lobby" className="text-accent hover:underline">lobby</Link> durante a janela. Vitória = 2 pts · Empate = 1 pt.
          </p>
        </div>
      )}
    </div>
  );
}
