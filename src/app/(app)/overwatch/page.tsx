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
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Overwatch</h1>
            <p className="mt-1 text-sm text-muted">Revisão comunitária de partidas suspeitas</p>
          </div>
          <Link href="/lobby" className="btn-secondary text-sm">← Lobby</Link>
        </div>
        <div className="card py-12 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <div className="font-semibold text-white">Acesso restrito</div>
          <p className="mt-2 text-sm text-muted">{reason}</p>
        </div>
      </div>
    );
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
