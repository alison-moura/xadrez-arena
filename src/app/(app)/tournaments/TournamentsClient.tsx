"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCoins } from "@/lib/utils";

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
  rating_min: number | null;
  rating_max: number | null;
  player_count: number;
  joined: boolean;
};

function formatTC(sec: number, inc: number): string {
  return `${Math.round(sec / 60)}${inc > 0 ? `+${inc}` : ""}`;
}

function timeFromNow(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "agora";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `em ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `em ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `em ${h}h${min % 60 ? ` ${min % 60}m` : ""}`;
  const d = Math.floor(h / 24);
  return `em ${d}d`;
}

export function TournamentsClient() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/tournaments");
    if (!res.ok) return;
    const data = await res.json();
    setTournaments(data.tournaments ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function join(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/tournaments/${id}/join`, { method: "POST" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await load();
  }

  const active    = tournaments.filter((t) => t.status === "ACTIVE");
  const scheduled = tournaments.filter((t) => t.status === "SCHEDULED");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Torneios</h1>
          <p className="text-xs text-muted">
            Arenas: jogue várias partidas seguidas. Top 3 leva o prize pool.
          </p>
        </div>
        <Link href="/lobby" className="btn-secondary text-xs">← Lobby</Link>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Como funciona */}
      <div className="card border-accent/30">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent">Como funciona</h2>
        <ul className="space-y-1 text-xs text-muted">
          <li>• <strong className="text-white">Inscreva-se</strong> num torneio antes ou durante a janela ativa</li>
          <li>• Durante a janela, crie ou entre em partidas no time control do torneio — o sistema marca a partida pro torneio</li>
          <li>• <strong className="text-white">Vitória</strong> = 2 pts · <strong className="text-white">Empate</strong> = 1 pt · <strong className="text-white">Derrota</strong> = 0 pts</li>
          <li>• Ao final, o prize pool é distribuído: <strong className="text-white">60% pro 1º</strong> · <strong className="text-white">25% pro 2º</strong> · <strong className="text-white">15% pro 3º</strong></li>
        </ul>
      </div>

      {loading ? (
        <div className="card py-12 text-center text-sm text-muted">Carregando…</div>
      ) : tournaments.length === 0 ? (
        <div className="card py-12 text-center">
          <div className="mb-2 text-3xl opacity-30">🏆</div>
          <p className="text-sm text-muted">Nenhum torneio agendado no momento.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">🔴 Ao vivo</h2>
              <div className="space-y-2">
                {active.map((t) => (
                  <TournamentCard key={t.id} t={t} busy={busyId === t.id} onJoin={() => join(t.id)} />
                ))}
              </div>
            </section>
          )}
          {scheduled.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">📅 Próximos</h2>
              <div className="space-y-2">
                {scheduled.map((t) => (
                  <TournamentCard key={t.id} t={t} busy={busyId === t.id} onJoin={() => join(t.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TournamentCard({ t, busy, onJoin }: { t: Tournament; busy: boolean; onJoin: () => void }) {
  const isActive = t.status === "ACTIVE";
  return (
    <div className={`card flex flex-wrap items-center justify-between gap-3 ${isActive ? "border-accent/40" : ""}`}>
      <Link href={`/tournaments/${t.id}`} className="flex items-start gap-3 min-w-0 flex-1 group">
        <div className="text-3xl">{isActive ? "🔥" : "🏆"}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold group-hover:text-accent transition-colors">{t.name}</h3>
            <span className="badge text-[10px]">⏱ {formatTC(t.time_control_seconds, t.time_increment_seconds)}</span>
            {t.entry_fee > 0 ? (
              <span className="badge text-[10px]">💸 {formatCoins(t.entry_fee)}</span>
            ) : (
              <span className="badge-success text-[10px]">grátis</span>
            )}
          </div>
          {t.description && <p className="mt-1 text-xs text-muted">{t.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted">
            <span>👥 {t.player_count} inscrito{t.player_count !== 1 ? "s" : ""}</span>
            {isActive ? (
              <span className="text-accent">termina {timeFromNow(t.ends_at)}</span>
            ) : (
              <span>começa {timeFromNow(t.starts_at)}</span>
            )}
            {(t.rating_min || t.rating_max) && (
              <span>rating {t.rating_min ?? "?"}–{t.rating_max ?? "?"}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex flex-col items-end gap-1.5">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Prize pool</div>
          <div className="font-bold text-accent">{formatCoins(t.prize_pool)}</div>
        </div>
        {t.joined ? (
          <span className="badge-success text-[10px]">✓ inscrito</span>
        ) : (
          <button
            onClick={onJoin}
            disabled={busy}
            className="btn-primary py-1.5 text-xs"
          >{busy ? "Inscrevendo…" : "Inscrever-se"}</button>
        )}
      </div>
    </div>
  );
}
