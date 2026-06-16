"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCoins, formatDate } from "@/lib/utils";

type Match = {
  id: string;
  wager: number;
  status: string;
  createdAt: string;
  rating_min: number | null;
  rating_max: number | null;
  whiteUser: { id: string; username: string; rating: number } | null;
  blackUser: { id: string; username: string; rating: number } | null;
};

function Avatar({ username }: { username: string }) {
  const initials = username.slice(0, 2).toUpperCase();
  const hue = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{ background: `hsl(${hue},45%,22%)`, color: `hsl(${hue},75%,70%)` }}
    >
      {initials}
    </div>
  );
}

function WagerBadge({ wager }: { wager: number }) {
  if (wager === 0) return <span className="badge text-[10px]">Amistoso</span>;
  if (wager >= 500) return <span className="badge-accent text-[10px]">💰 {formatCoins(wager)}</span>;
  if (wager >= 100) return <span className="badge text-[10px] border-success/40 text-success bg-success/10">{formatCoins(wager)}</span>;
  return <span className="badge text-[10px]">{formatCoins(wager)}</span>;
}

function RatingRangeBadge({ min, max }: { min: number | null; max: number | null }) {
  if (min == null && max == null) return <span className="badge text-[10px]">Aberto</span>;
  return (
    <span className="badge text-[10px]">
      {min ?? "?"}–{max ?? "?"}
    </span>
  );
}

const RANGE_OPTIONS = [
  { value: "200", label: "±200", desc: "Competitivo" },
  { value: "500", label: "±500", desc: "Relaxado" },
  { value: "open", label: "Livre", desc: "Qualquer rating" },
] as const;

export function LobbyClient({ viewerRating }: { viewerRating: number }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState<Match[]>([]);
  const [active, setActive] = useState<Match[]>([]);
  const [wager, setWager] = useState(50);
  const [color, setColor] = useState<"w" | "b" | "random">("random");
  const [ratingRange, setRatingRange] = useState<"200" | "500" | "open">("200");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [botColor, setBotColor] = useState<"w" | "b" | "random">("w");
  const [creatingBot, setCreatingBot] = useState(false);

  async function load() {
    const [w, a] = await Promise.all([
      fetch("/api/matches?status=WAITING").then((r) => r.json()),
      fetch("/api/matches?status=ACTIVE").then((r) => r.json()),
    ]);
    setWaiting(w.matches ?? []);
    setActive(a.matches ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wager, preferredColor: color, ratingRange }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setError(data.error ?? "Erro ao criar"); return; }
    router.push(`/match/${data.matchId}`);
  }

  async function createBotMatch(e: React.FormEvent) {
    e.preventDefault();
    setCreatingBot(true);
    setError(null);
    const res = await fetch("/api/matches/vs-bot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ difficulty: botDifficulty, preferredColor: botColor }),
    });
    const data = await res.json();
    setCreatingBot(false);
    if (!res.ok) { setError(data.error ?? "Erro ao criar partida vs bot"); return; }
    router.push(`/match/${data.matchId}`);
  }

  async function joinMatch(id: string) {
    setJoining(id);
    const res = await fetch(`/api/matches/${id}/join`, { method: "POST" });
    const data = await res.json();
    setJoining(null);
    if (!res.ok) { alert(data.error ?? "Erro ao entrar"); return; }
    router.push(`/match/${id}`);
  }

  function canJoin(m: Match) {
    if (m.rating_min != null && viewerRating < m.rating_min) return false;
    if (m.rating_max != null && viewerRating > m.rating_max) return false;
    return true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Waiting */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Partidas abertas</h2>
            <span className="badge text-[10px]">{waiting.length} aguardando</span>
          </div>
          {waiting.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-8 text-center text-muted">
              <span className="text-3xl opacity-30">♟</span>
              <p className="text-sm">Nenhuma partida aberta.</p>
              <p className="text-xs">Crie a sua pelo painel ao lado!</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {waiting.map((m) => {
                const host = m.whiteUser ?? m.blackUser;
                const hostColorLabel = m.whiteUser ? "Brancas" : "Pretas";
                const joinable = canJoin(m);
                return (
                  <li key={m.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      {host && <Avatar username={host.username} />}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">@{host?.username}</span>
                          <span className="text-[10px] text-muted">{host?.rating} elo</span>
                          <WagerBadge wager={m.wager} />
                          <RatingRangeBadge min={m.rating_min} max={m.rating_max} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          Joga de {hostColorLabel} • pot{" "}
                          <span className="text-accent">{formatCoins(m.wager * 2)}</span> •{" "}
                          {formatDate(m.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/match/${m.id}`} className="btn-secondary py-1.5 text-xs">
                        Ver
                      </Link>
                      <button
                        onClick={() => joinMatch(m.id)}
                        disabled={joining === m.id || !joinable}
                        title={!joinable ? `Fora da faixa de rating (${m.rating_min}–${m.rating_max})` : undefined}
                        className={`py-1.5 text-xs ${joinable ? "btn-primary" : "btn-secondary opacity-40 cursor-not-allowed"}`}
                      >
                        {joining === m.id ? "Entrando…" : joinable ? "Entrar" : "Fora do range"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Active */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Em andamento</h2>
            <span className="badge-accent text-[10px]">{active.length} ativas</span>
          </div>
          {active.length === 0 ? (
            <div className="card py-6 text-center text-sm text-muted">
              Nenhuma partida em andamento.
            </div>
          ) : (
            <ul className="space-y-2">
              {active.map((m) => (
                <li key={m.id} className="card flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {m.whiteUser && <Avatar username={m.whiteUser.username} />}
                      {m.blackUser && <Avatar username={m.blackUser.username} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-semibold">@{m.whiteUser?.username ?? "—"}</span>
                        <span className="text-muted">vs</span>
                        <span className="font-semibold">@{m.blackUser?.username ?? "Bot"}</span>
                      </div>
                      <div className="text-xs text-muted">
                        pot <span className="text-accent">{formatCoins(m.wager * 2)}</span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/match/${m.id}`} className="btn-secondary py-1.5 text-xs">
                    Assistir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        {/* Create match */}
        <div className="card">
          <h3 className="text-base font-semibold">Criar partida</h3>
          <p className="mt-1 text-xs text-muted">
            Aposta vai pra escrow. Vencedor leva o pote com 5% de rake.
          </p>
          <form onSubmit={createMatch} className="mt-4 space-y-4">
            <div>
              <label className="label">Aposta (coins)</label>
              <input
                type="number"
                min={0}
                step={10}
                className="input"
                value={wager}
                onChange={(e) => setWager(Math.max(0, Number(e.target.value)))}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0, 25, 50, 100, 250, 500].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setWager(v)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      wager === v
                        ? "border-accent bg-accent text-black"
                        : "border-border text-muted hover:border-accent/50 hover:text-white"
                    }`}
                  >
                    {v === 0 ? "Amistoso" : formatCoins(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Faixa de rating</label>
              <div className="grid grid-cols-3 gap-1.5">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setRatingRange(opt.value)}
                    className={`rounded-lg border py-2 text-xs transition-colors ${
                      ratingRange === opt.value
                        ? "border-accent bg-accent text-black font-medium"
                        : "border-border text-muted hover:border-accent/40 hover:text-white"
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-[10px] opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
              {ratingRange !== "open" && (
                <p className="mt-1.5 text-[11px] text-muted">
                  Seu rating ({viewerRating}) → aceitará {viewerRating - Number(ratingRange)}–{viewerRating + Number(ratingRange)}
                </p>
              )}
            </div>

            <div>
              <label className="label">Sua cor</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["w", "random", "b"] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={`rounded-lg border py-2 text-xs transition-colors ${
                      color === c
                        ? "border-accent bg-accent text-black font-medium"
                        : "border-border text-muted hover:border-accent/40 hover:text-white"
                    }`}
                  >
                    {c === "w" ? "♔ Brancas" : c === "b" ? "♚ Pretas" : "🎲 Aleatório"}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-danger">{error}</p>
            )}
            <button type="submit" disabled={creating} className="btn-primary w-full">
              {creating ? "Criando…" : wager > 0 ? `Criar • ${formatCoins(wager)} coins` : "Criar amistoso"}
            </button>
          </form>
        </div>

        {/* Bot */}
        <div className="card border-accent/25 ring-1 ring-accent/15">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">🤖 Jogar vs Bot</h3>
            <span className="badge-accent text-[10px]">treino</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Sem aposta, sem rating. Conquistas de bot contam!
          </p>
          <form onSubmit={createBotMatch} className="mt-4 space-y-3">
            <div>
              <label className="label">Dificuldade</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={`rounded-lg border py-2 text-xs transition-colors ${
                      botDifficulty === d
                        ? "border-accent bg-accent text-black font-medium"
                        : "border-border text-muted hover:border-accent/40 hover:text-white"
                    }`}
                  >
                    {d === "easy" ? "😊 Fácil" : d === "medium" ? "🎯 Médio" : "🔥 Difícil"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Sua cor</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["w", "random", "b"] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setBotColor(c)}
                    className={`rounded-lg border py-2 text-xs transition-colors ${
                      botColor === c
                        ? "border-accent bg-accent text-black font-medium"
                        : "border-border text-muted hover:border-accent/40 hover:text-white"
                    }`}
                  >
                    {c === "w" ? "♔ Brancas" : c === "b" ? "♚ Pretas" : "🎲 Aleatório"}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={creatingBot} className="btn-secondary w-full">
              {creatingBot ? "Iniciando…" : "Começar partida"}
            </button>
          </form>
        </div>

        {/* How it works */}
        <div className="card">
          <h3 className="text-sm font-semibold">Como funciona</h3>
          <ul className="mt-3 space-y-2 text-xs text-muted">
            {[
              "Crie ou entre em uma partida (ou treine vs bot).",
              "O valor vai pro escrow assim que ambos confirmam.",
              "O vencedor leva o pote (com 5% de taxa da casa).",
              <>Saque coins via <a href="/wallet" className="text-accent hover:underline">Carteira</a>. Ganhe <a href="/achievements" className="text-accent hover:underline">Conquistas</a>!</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-accent">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
