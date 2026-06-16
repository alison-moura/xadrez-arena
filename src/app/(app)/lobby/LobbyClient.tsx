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
  whiteUser: { id: string; username: string; rating: number } | null;
  blackUser: { id: string; username: string; rating: number } | null;
};

export function LobbyClient() {
  const router = useRouter();
  const [waiting, setWaiting] = useState<Match[]>([]);
  const [active, setActive] = useState<Match[]>([]);
  const [wager, setWager] = useState(50);
  const [color, setColor] = useState<"w" | "b" | "random">("random");
  const [creating, setCreating] = useState(false);
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
      body: JSON.stringify({ wager, preferredColor: color }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar");
      return;
    }
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
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar partida vs bot");
      return;
    }
    router.push(`/match/${data.matchId}`);
  }

  async function joinMatch(id: string) {
    const res = await fetch(`/api/matches/${id}/join`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erro ao entrar");
      return;
    }
    router.push(`/match/${id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Partidas abertas</h2>
            <span className="text-xs text-muted">{waiting.length} aguardando</span>
          </div>
          {waiting.length === 0 ? (
            <div className="card text-center text-muted">
              Nenhuma partida aberta. Crie a sua!
            </div>
          ) : (
            <ul className="space-y-3">
              {waiting.map((m) => {
                const host = m.whiteUser ?? m.blackUser;
                const hostColor = m.whiteUser ? "Brancas" : "Pretas";
                return (
                  <li key={m.id} className="card flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm">
                        <span className="font-semibold">@{host?.username}</span>{" "}
                        <span className="text-muted">
                          ({host?.rating} • joga de {hostColor})
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Aposta:{" "}
                        <span className="text-accent">{formatCoins(m.wager)} coins</span> • pot{" "}
                        {formatCoins(m.wager * 2)} • {formatDate(m.createdAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/match/${m.id}`} className="btn-secondary">
                        Ver
                      </Link>
                      <button onClick={() => joinMatch(m.id)} className="btn-primary">
                        Entrar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Partidas em andamento</h2>
            <span className="text-xs text-muted">{active.length} ativas</span>
          </div>
          {active.length === 0 ? (
            <div className="card text-center text-muted">
              Nenhuma partida em andamento.
            </div>
          ) : (
            <ul className="space-y-3">
              {active.map((m) => (
                <li key={m.id} className="card flex items-center justify-between">
                  <div>
                    <div className="text-sm">
                      <span className="font-semibold">@{m.whiteUser?.username}</span>
                      <span className="text-muted"> vs </span>
                      <span className="font-semibold">@{m.blackUser?.username}</span>
                    </div>
                    <div className="text-xs text-muted">
                      pot {formatCoins(m.wager * 2)} coins
                    </div>
                  </div>
                  <Link href={`/match/${m.id}`} className="btn-secondary">
                    Assistir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card">
          <h3 className="text-lg font-semibold">Criar partida</h3>
          <p className="mt-1 text-xs text-muted">
            Defina a aposta e a cor. O valor sai do seu saldo e vai pra escrow.
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
              <div className="mt-2 flex flex-wrap gap-2">
                {[0, 25, 50, 100, 250, 500].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setWager(v)}
                    className={`rounded border border-border px-2 py-1 text-xs ${
                      wager === v ? "bg-accent text-black" : "text-muted hover:text-white"
                    }`}
                  >
                    {v === 0 ? "Amistoso" : formatCoins(v)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Sua cor</label>
              <div className="grid grid-cols-3 gap-2">
                {(["w", "random", "b"] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={`rounded border border-border px-2 py-2 text-sm ${
                      color === c ? "bg-accent text-black" : "text-muted hover:text-white"
                    }`}
                  >
                    {c === "w" ? "Brancas" : c === "b" ? "Pretas" : "Aleatório"}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={creating} className="btn-primary w-full">
              {creating ? "Criando…" : `Criar partida${wager ? ` • ${formatCoins(wager)}` : ""}`}
            </button>
          </form>
        </div>

        <div className="card border-accent/30 ring-1 ring-accent/20">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">🤖 Jogar contra o Bot</h3>
            <span className="badge-accent">treino</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Sem aposta, sem rating. Pra testar suas habilidades antes de apostar.
          </p>
          <form onSubmit={createBotMatch} className="mt-4 space-y-3">
            <div>
              <label className="label">Dificuldade</label>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={`rounded border border-border px-2 py-2 text-sm ${
                      botDifficulty === d ? "bg-accent text-black" : "text-muted hover:text-white"
                    }`}
                  >
                    {d === "easy" ? "Fácil" : d === "medium" ? "Médio" : "Difícil"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Sua cor</label>
              <div className="grid grid-cols-3 gap-2">
                {(["w", "random", "b"] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setBotColor(c)}
                    className={`rounded border border-border px-2 py-2 text-sm ${
                      botColor === c ? "bg-accent text-black" : "text-muted hover:text-white"
                    }`}
                  >
                    {c === "w" ? "Brancas" : c === "b" ? "Pretas" : "Aleatório"}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={creatingBot} className="btn-secondary w-full">
              {creatingBot ? "Iniciando…" : "Começar partida"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold">Como funciona</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>1. Crie ou entre em uma partida (ou jogue contra o bot).</li>
            <li>2. O valor vai pro escrow assim que ambos confirmam.</li>
            <li>3. O vencedor leva o pote (com 5% de taxa).</li>
            <li>4. Saque coins via Carteira → Sacar.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
