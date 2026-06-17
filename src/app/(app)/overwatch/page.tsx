"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamicLoad from "next/dynamic";
import { Chess } from "chess.js";
import Link from "next/link";

const Chessboard = dynamicLoad(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Player = { id: string; username: string; rating: number };

type OWCase = {
  id: string;
  accused_id: string;
  match_id: string;
  status: string;
  votes_needed: number;
  created_at: string;
  accused: { id: string; username: string; rating: number; games_played: number } | null;
  match: {
    id: string;
    pgn: string;
    move_count: number;
    result: string | null;
    finished_at: string | null;
    white_user: Player | null;
    black_user: Player | null;
  } | null;
  my_vote: "CLEAN" | "CHEATER" | null;
  vote_counts: { CLEAN: number; CHEATER: number };
};

export const dynamic = "force-dynamic";

export default function OverwatchPage() {
  const [loading, setLoading]       = useState(true);
  const [eligible, setEligible]     = useState(false);
  const [reason, setReason]         = useState<string>("");
  const [cases, setCases]           = useState<OWCase[]>([]);
  const [activeCase, setActiveCase] = useState<OWCase | null>(null);
  const [plyIndex, setPlyIndex]     = useState(0);
  const [voting, setVoting]         = useState(false);
  const [voteResult, setVoteResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/overwatch");
    const d = await r.json();
    setEligible(d.eligible ?? false);
    setReason(d.reason ?? "");
    setCases(d.cases ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // PGN → array of FEN positions
  const positions = useMemo<string[]>(() => {
    if (!activeCase?.match?.pgn) return [];
    const chess = new Chess();
    const fens: string[] = [chess.fen()];
    try {
      const tokens = activeCase.match.pgn
        .replace(/\{[^}]*\}/g, "")
        .replace(/\([^)]*\)/g, "")
        .split(/\s+/)
        .filter((t) => t && !/^(\d+\.+|1-0|0-1|1\/2|½|\*)/.test(t));
      const tmp = new Chess();
      for (const san of tokens) {
        const move = tmp.move(san);
        if (!move) break;
        fens.push(tmp.fen());
      }
    } catch { /* ignore */ }
    return fens;
  }, [activeCase]);

  useEffect(() => {
    if (activeCase) setPlyIndex(positions.length - 1);
  }, [activeCase, positions.length]);

  const currentFen = positions[plyIndex] ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  async function vote(owCaseId: string, v: "CLEAN" | "CHEATER") {
    setVoting(true);
    setVoteResult(null);
    const r = await fetch(`/api/overwatch/${owCaseId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote: v }),
    });
    const d = await r.json();
    if (r.ok) {
      setVoteResult(d.resolved ? `Resolvido: ${d.verdict}` : "Voto registrado!");
      await load();
      setActiveCase(null);
    } else {
      setVoteResult(d.error ?? "Erro ao votar");
    }
    setVoting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        Carregando Overwatch…
      </div>
    );
  }

  if (!eligible) {
    return <OverwatchLanding reason={reason} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overwatch</h1>
          <p className="mt-1 text-sm text-muted">
            {cases.length} caso{cases.length !== 1 ? "s" : ""} aberto{cases.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/lobby" className="btn-secondary text-sm">← Lobby</Link>
      </div>

      {voteResult && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
          {voteResult}
        </div>
      )}

      {cases.length === 0 && (
        <div className="card py-12 text-center">
          <div className="mb-2 text-3xl">✅</div>
          <p className="text-muted">Nenhum caso pendente. Volte mais tarde.</p>
        </div>
      )}

      {/* Case list or active case */}
      {!activeCase ? (
        <div className="space-y-3">
          {cases.map((c) => {
            const accused = c.accused;
            const match   = c.match;
            const total   = (c.vote_counts.CLEAN ?? 0) + (c.vote_counts.CHEATER ?? 0);
            return (
              <div key={c.id} className="card flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">@{accused?.username ?? c.accused_id}</span>
                    <span className="text-xs text-muted">({accused?.rating ?? "?"} rating · {accused?.games_played ?? "?"} partidas)</span>
                    {c.my_vote && (
                      <span className={`badge text-[10px] ${c.my_vote === "CHEATER" ? "badge-danger" : "badge-success"}`}>
                        Seu voto: {c.my_vote}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Partida #{c.match_id.slice(0, 8)} · {match?.move_count ?? 0} lances ·{" "}
                    {total}/{c.votes_needed} votos
                  </div>
                </div>
                <button
                  onClick={() => { setActiveCase(c); setVoteResult(null); }}
                  className="btn-primary text-sm shrink-0"
                  disabled={!!c.my_vote}
                >
                  {c.my_vote ? "Votado" : "Revisar"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setActiveCase(null)} className="btn-secondary text-sm">
            ← Voltar aos casos
          </button>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            {/* Board viewer */}
            <div className="space-y-3">
              <div className="card">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    @{activeCase.match?.white_user?.username ?? "?"} vs @{activeCase.match?.black_user?.username ?? "?"}
                  </div>
                  <span className="badge text-[10px]">{activeCase.match?.move_count ?? 0} lances</span>
                </div>
                <div className="mx-auto max-w-[400px]">
                  <Chessboard
                    position={currentFen}
                    arePiecesDraggable={false}
                    boardWidth={400}
                    customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
                    customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
                    showBoardNotation
                  />
                </div>
                {/* Navigation */}
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPlyIndex(0)}
                    disabled={plyIndex === 0}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                  >⏮</button>
                  <button
                    onClick={() => setPlyIndex((i) => Math.max(0, i - 1))}
                    disabled={plyIndex === 0}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                  >◀</button>
                  <span className="text-xs text-muted">
                    Lance {plyIndex}/{positions.length - 1}
                  </span>
                  <button
                    onClick={() => setPlyIndex((i) => Math.min(positions.length - 1, i + 1))}
                    disabled={plyIndex >= positions.length - 1}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                  >▶</button>
                  <button
                    onClick={() => setPlyIndex(positions.length - 1)}
                    disabled={plyIndex >= positions.length - 1}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                  >⏭</button>
                </div>
              </div>
            </div>

            {/* Verdict panel */}
            <div className="space-y-3">
              <div className="card">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                  Acusado
                </div>
                <div className="font-semibold">@{activeCase.accused?.username}</div>
                <div className="mt-0.5 text-xs text-muted">
                  Rating: {activeCase.accused?.rating} · {activeCase.accused?.games_played} partidas
                </div>
              </div>

              <div className="card">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                  Votos até agora
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-success">LIMPO</span>
                    <span className="font-mono">{activeCase.vote_counts.CLEAN}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-danger">TRAPAÇA</span>
                    <span className="font-mono">{activeCase.vote_counts.CHEATER}</span>
                  </div>
                  <div className="text-xs text-muted">
                    Necessário: {activeCase.votes_needed} votos totais
                  </div>
                </div>
              </div>

              <div className="card space-y-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  Seu veredicto
                </div>
                <p className="text-xs text-muted">
                  Assista à partida e avalie se o jogador jogou honestamente.
                  Votos corretos rendem +50 coins.
                </p>
                {activeCase.my_vote ? (
                  <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
                    Você já votou: <strong>{activeCase.my_vote}</strong>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => vote(activeCase.id, "CLEAN")}
                      disabled={voting}
                      className="btn-primary w-full disabled:opacity-50"
                    >
                      ✅ Jogador Limpo
                    </button>
                    <button
                      onClick={() => vote(activeCase.id, "CHEATER")}
                      disabled={voting}
                      className="btn-danger w-full disabled:opacity-50"
                    >
                      🚫 Usou Engine
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverwatchLanding({ reason }: { reason: string }) {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-accent/5 px-6 py-10 text-center sm:px-10 sm:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,179,1,0.10),transparent_40%),radial-gradient(circle_at_70%_80%,rgba(120,80,220,0.10),transparent_40%)]" />
        <div className="relative">
          <div className="mb-3 text-5xl">⚖️</div>
          <h1 className="text-3xl font-bold sm:text-4xl">Overwatch</h1>
          <p className="mt-3 text-base text-muted sm:text-lg">
            O sistema de justiça comunitária do Xadrez Arena.<br />
            Jogadores experientes revisam partidas suspeitas e decidem juntos.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm">
            <span className="text-yellow-300">🔒</span>
            <span className="text-yellow-200">{reason || "Você ainda não tem acesso ao Overwatch."}</span>
          </div>
        </div>
      </div>

      {/* Como funciona */}
      <section>
        <h2 className="mb-4 text-xl font-bold">Como funciona</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: "🚨", title: "1. Denúncia", text: "Após uma partida, qualquer jogador pode denunciar o oponente por uso de engine, comportamento abusivo ou jogo lento intencional." },
            { icon: "🔍", title: "2. Análise automática", text: "O Stockfish avalia a partida e calcula um score de suspeição. Se passar do limite, um caso é aberto pro Overwatch." },
            { icon: "🗳️", title: "3. Voto da comunidade", text: "Árbitros elegíveis assistem o replay lance por lance e votam: limpo ou trapaça. Maioria decide." },
          ].map((s) => (
            <div key={s.title} className="card flex h-full flex-col gap-2">
              <div className="text-3xl">{s.icon}</div>
              <h3 className="font-semibold text-white">{s.title}</h3>
              <p className="text-xs text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Consequências */}
      <section>
        <h2 className="mb-4 text-xl font-bold">O que acontece após o veredito</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card border-success/30">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <h3 className="font-semibold text-success">Veredito: Limpo</h3>
            </div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li>• A acusação é descartada</li>
              <li>• O score de suspeição do acusado é reduzido</li>
              <li>• Árbitros que votaram "limpo" ganham <strong className="text-success">+50 coins</strong></li>
            </ul>
          </div>
          <div className="card border-danger/30">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">🚫</span>
              <h3 className="font-semibold text-danger">Veredito: Trapaça</h3>
            </div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li>• O acusado é <strong className="text-danger">banido</strong> automaticamente</li>
              <li>• Partidas ativas dele são canceladas; apostas devolvidas pros dois lados</li>
              <li>• Árbitros que votaram "trapaça" ganham <strong className="text-success">+50 coins</strong></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Quem participa */}
      <section>
        <div className="card flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="text-5xl">🎓</div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Como me tornar Árbitro?</h2>
            <p className="mt-2 text-sm text-muted">
              Pra evitar que contas novas ou trolls decidam casos, o Overwatch só está aberto pra quem demonstrou comprometimento com o jogo.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                <div className="text-xs uppercase tracking-wider text-muted">Requisito 1</div>
                <div className="mt-1 font-semibold text-white">Rating ≥ 1500</div>
                <div className="mt-1 text-[10px] text-muted">Ganhe partidas pra subir seu ELO.</div>
              </div>
              <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                <div className="text-xs uppercase tracking-wider text-muted">OU Requisito 2</div>
                <div className="mt-1 font-semibold text-white">50+ partidas jogadas</div>
                <div className="mt-1 text-[10px] text-muted">Mostra que você conhece o jogo.</div>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">
              Conta banida = sem acesso. Cumpra um dos requisitos e o acesso é desbloqueado automaticamente.
            </p>
          </div>
        </div>
      </section>

      {/* Conquista */}
      <section>
        <div className="card flex flex-wrap items-center gap-4">
          <div className="text-4xl">⚖️</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Conquista: Árbitro</h3>
            <p className="text-xs text-muted">Vote corretamente em 10 análises de Overwatch e ganhe 200 coins extras.</p>
          </div>
          <Link href="/achievements" className="btn-secondary text-xs">Ver conquistas</Link>
        </div>
      </section>

      {/* CTA */}
      <div className="flex justify-center pt-2">
        <Link href="/lobby" className="btn-primary">
          Começar a jogar ranqueadas
        </Link>
      </div>
    </div>
  );
}
