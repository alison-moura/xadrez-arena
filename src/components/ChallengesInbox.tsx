"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCoins } from "@/lib/utils";
import { play as playSound } from "@/lib/sounds";

type ChallengeUser = { id: string; username: string; rating: number } | { id: string; username: string; rating: number }[] | null;

type Challenge = {
  id: string;
  wager: number;
  created_at: string;
  creator_id: string;
  time_control_seconds: number | null;
  time_increment_seconds: number | null;
  white_user: ChallengeUser;
  black_user: ChallengeUser;
  challenged: ChallengeUser;
};

function one(u: ChallengeUser): { id: string; username: string; rating: number } | null {
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

function fmtTime(tc: number | null, inc: number | null): string {
  if (!tc) return "sem tempo";
  const m = Math.floor(tc / 60);
  const base = m >= 1 ? `${m} min` : `${tc}s`;
  return inc ? `${base} +${inc}s` : base;
}

export function ChallengesInbox() {
  const router = useRouter();
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [outgoing, setOutgoing] = useState<Challenge[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevCountRef = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/challenges");
    if (!res.ok) return;
    const data = await res.json();
    const inc: Challenge[] = data.incoming ?? [];
    setIncoming(inc);
    setOutgoing(data.outgoing ?? []);
    if (inc.length > prevCountRef.current) playSound("notify");
    prevCountRef.current = inc.length;
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function accept(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/matches/${id}/join`, { method: "POST" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(data.error ?? "Erro ao aceitar"); await load(); return; }
    router.push(`/match/${id}`);
  }

  async function decline(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/matches/${id}/decline-challenge`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao recusar");
    }
    await load();
  }

  async function cancelOutgoing(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/matches/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao cancelar");
    }
    await load();
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}

      {incoming.map((c) => {
        const from = one(c.white_user) ?? one(c.black_user);
        const hostColor = one(c.white_user) ? "Brancas" : "Pretas";
        return (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3 border-accent/50 bg-accent/5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚔️</span>
              <div>
                <div className="text-sm">
                  <span className="font-semibold text-accent">@{from?.username}</span>{" "}
                  <span className="text-muted">({from?.rating}) te desafiou!</span>
                </div>
                <div className="text-[11px] text-muted">
                  {fmtTime(c.time_control_seconds, c.time_increment_seconds)} · joga de {hostColor} ·{" "}
                  {c.wager > 0 ? <span className="text-accent">{formatCoins(c.wager)} coins</span> : "amistoso"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => accept(c.id)}
                disabled={busyId === c.id}
                className="btn-primary py-1.5 text-xs"
              >
                ✓ Aceitar{c.wager > 0 ? ` (${formatCoins(c.wager)})` : ""}
              </button>
              <button
                onClick={() => decline(c.id)}
                disabled={busyId === c.id}
                className="btn-secondary py-1.5 text-xs hover:border-danger/40 hover:text-danger"
              >
                Recusar
              </button>
            </div>
          </div>
        );
      })}

      {outgoing.map((c) => {
        const target = one(c.challenged);
        return (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-xs text-muted">
              ⏳ Desafio enviado pra <span className="font-semibold text-white">@{target?.username}</span> ·{" "}
              {fmtTime(c.time_control_seconds, c.time_increment_seconds)} ·{" "}
              {c.wager > 0 ? `${formatCoins(c.wager)} coins` : "amistoso"} — aguardando resposta
            </div>
            <button
              onClick={() => cancelOutgoing(c.id)}
              disabled={busyId === c.id}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:border-danger/40 hover:text-danger"
            >
              Cancelar
            </button>
          </div>
        );
      })}
    </div>
  );
}
