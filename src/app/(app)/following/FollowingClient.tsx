"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Followed = {
  id: string;
  username: string;
  rating: number;
  last_seen_at: string | null;
};

type Item = {
  followed_id: string;
  created_at: string;
  followed: Followed | Followed[] | null;
};

function onlineState(lastSeen: string | null, now: number): { color: string; label: string } {
  if (!lastSeen) return { color: "bg-muted", label: "nunca visto" };
  const diff = now - new Date(lastSeen).getTime();
  if (diff < 5  * 60_000) return { color: "bg-success", label: "online" };
  if (diff < 60 * 60_000) return { color: "bg-yellow-400", label: "ativo recente" };
  if (diff < 24 * 60 * 60_000) return { color: "bg-muted",   label: "hoje" };
  return { color: "bg-border", label: "offline" };
}

export function FollowingClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/following");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.following ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function unfollow(userId: string) {
    const res = await fetch(`/api/users/${userId}/follow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unfollow" }),
    });
    if (res.ok) await load();
  }

  if (loading) {
    return <div className="card py-12 text-center text-sm text-muted">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Seguindo</h1>
          <p className="text-xs text-muted">Status online em tempo quase real (atualiza a cada 30s).</p>
        </div>
        <Link href="/leaderboard" className="btn-secondary text-xs">Explorar ranking</Link>
      </div>

      {items.length === 0 ? (
        <div className="card py-12 text-center">
          <div className="mb-2 text-3xl opacity-30">👥</div>
          <p className="text-sm text-muted">Você ainda não está seguindo ninguém.</p>
          <p className="text-xs">Clique em "Seguir" no perfil de qualquer jogador.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const u = Array.isArray(it.followed) ? it.followed[0] : it.followed;
            if (!u) return null;
            const status = onlineState(u.last_seen_at, now);
            return (
              <li key={u.id} className="card flex items-center justify-between gap-3">
                <Link href={`/u/${encodeURIComponent(u.username)}`} className="flex items-center gap-3 min-w-0 flex-1 hover:text-accent">
                  <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} title={status.label} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">@{u.username}</div>
                    <div className="text-[10px] text-muted">
                      Rating <span className="text-white">{u.rating}</span> · {status.label}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => unfollow(u.id)}
                  className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs text-muted hover:border-danger/40 hover:text-danger"
                >
                  Deixar de seguir
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
