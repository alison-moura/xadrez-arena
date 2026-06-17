"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [challenging, setChallenging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function challenge() {
    setChallenging("creating");
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wager: 0,
        preferredColor: "random",
        ratingRange: "open",
        timeControlSeconds: 300,
        timeIncrementSeconds: 3,
        isPrivate: true,
      }),
    });
    const data = await res.json();
    setChallenging(null);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    router.push(`/match/${data.matchId}`);
  }

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
        <div className="flex gap-2">
          <button onClick={challenge} disabled={!!challenging} className="btn-primary text-xs">
            {challenging ? "Criando…" : "🔗 Desafiar por link"}
          </button>
          <Link href="/leaderboard" className="btn-secondary text-xs">Explorar ranking</Link>
        </div>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="card border-accent/30">
        <h2 className="text-sm font-semibold text-accent">🔗 Desafiar por link</h2>
        <p className="mt-1 text-xs text-muted">
          Cria uma partida privada 5+3 sem aposta e te leva pra ela. Depois é só clicar no botão de compartilhar
          (🔗 no canto da partida) e mandar o link pro amigo.
        </p>
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
