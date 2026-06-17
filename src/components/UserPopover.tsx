"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ProfileCard = {
  user: {
    id: string;
    username: string;
    rating: number;
    games_played: number;
    is_bot: boolean;
    is_banned: boolean;
    created_at: string;
  };
  stats: {
    sample: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    streak: number;
  };
};

const cache = new Map<string, ProfileCard>();

export function UserPopover({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProfileCard | null>(cache.get(userId) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCard() {
    if (cache.has(userId)) { setData(cache.get(userId)!); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/profile-card`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro");
      cache.set(userId, d);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpen(true);
      loadCard();
    }, 250);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={() => { setOpen((v) => !v); if (!data) loadCard(); }}
    >
      <span className="cursor-pointer hover:text-accent">{children}</span>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-border bg-surface p-3 shadow-2xl"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {loading && <p className="text-xs text-muted">Carregando…</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          {data && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <Link href={`/u/${encodeURIComponent(data.user.username)}`} className="font-semibold text-white hover:text-accent">
                  @{data.user.username}
                </Link>
                <span className="text-accent">{data.user.rating} elo</span>
              </div>
              {data.user.is_bot && (
                <span className="badge-accent text-[10px]">Bot</span>
              )}
              {data.user.is_banned && (
                <span className="badge-danger text-[10px]">Banido</span>
              )}
              <div className="text-muted">
                {data.user.games_played} partidas no total
                {data.user.games_played < 10 && <span className="ml-1 text-accent">(provisional)</span>}
              </div>
              {data.stats.sample > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 rounded bg-surfaceAlt p-2 text-center">
                    <div>
                      <div className="text-sm font-bold text-success">{data.stats.wins}</div>
                      <div className="text-[10px] text-muted">V</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-muted">{data.stats.draws}</div>
                      <div className="text-[10px] text-muted">E</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-danger">{data.stats.losses}</div>
                      <div className="text-[10px] text-muted">D</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-muted">
                    <span>Win rate <span className="font-semibold text-white">{data.stats.winRate}%</span></span>
                    {data.stats.streak > 1 && (
                      <span className="text-accent">🔥 {data.stats.streak}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted">últimas {data.stats.sample} partidas</div>
                </>
              ) : (
                <div className="text-muted">Sem partidas finalizadas ainda.</div>
              )}
              <Link href={`/u/${encodeURIComponent(data.user.username)}`} className="block text-center text-[10px] text-accent hover:underline">
                Ver perfil completo →
              </Link>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
