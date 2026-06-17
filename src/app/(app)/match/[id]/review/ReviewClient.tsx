"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import Link from "next/link";
import { getStockfish } from "@/lib/stockfish-client";
import { downloadPgn } from "@/lib/pgn-export";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Player = { id: string; username: string; rating: number } | null;

type MatchData = {
  id: string;
  pgn: string;
  fen: string;
  status: string;
  result: string | null;
  move_count: number;
  bot_difficulty: string | null;
  white_user_id: string | null;
  black_user_id: string | null;
  winner_id: string | null;
  white_avg_cpl: number | null;
  black_avg_cpl: number | null;
  white_accuracy: number | null;
  black_accuracy: number | null;
  move_cpls: number[] | null;
  analyzed_at: string | null;
  white_user: Player;
  black_user: Player;
  winner: { id: string; username: string } | null;
};

// Marcador de qualidade por CPL (estilo chess.com)
function moveMark(cpl: number): { mark: string; label: string; color: string } | null {
  if (cpl >= 300) return { mark: "??", label: "Blunder",    color: "text-danger" };
  if (cpl >= 150) return { mark: "?",  label: "Erro",       color: "text-red-400" };
  if (cpl >= 60)  return { mark: "?!", label: "Imprecisão", color: "text-yellow-400" };
  if (cpl <= 10)  return { mark: "✓",  label: "Preciso",    color: "text-success" };
  return null;
}

export function ReviewClient({ match, viewerId }: { match: MatchData; viewerId: string }) {
  const isPlayer = match.white_user_id === viewerId || match.black_user_id === viewerId;
  const orientation: "white" | "black" = match.black_user_id === viewerId ? "black" : "white";
  const isBotMatch = match.bot_difficulty !== null;

  const [ply, setPly] = useState<number>(0);
  const [analysis, setAnalysis] = useState<{
    white_avg_cpl: number | null;
    black_avg_cpl: number | null;
    white_accuracy: number | null;
    black_accuracy: number | null;
  }>({
    white_avg_cpl:  match.white_avg_cpl,
    black_avg_cpl:  match.black_avg_cpl,
    white_accuracy: match.white_accuracy,
    black_accuracy: match.black_accuracy,
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(!!match.analyzed_at);
  const [moveCpls, setMoveCpls] = useState<number[] | null>(match.move_cpls ?? null);
  const [bestArrow, setBestArrow] = useState<[string, string, string] | null>(null);
  const [showBestArrow, setShowBestArrow] = useState(false);

  // PGN → positions array
  const positions = useMemo<string[]>(() => {
    const fens: string[] = [];
    const chess = new Chess();
    fens.push(chess.fen());
    if (!match.pgn) return fens;
    try {
      const tokens = match.pgn
        .replace(/\{[^}]*\}/g, "")
        .replace(/\([^)]*\)/g, "")
        .split(/\s+/)
        .filter((t) => t && !/^(\d+\.+|1-0|0-1|1\/2|½|\*)/.test(t));
      const c = new Chess();
      for (const san of tokens) {
        const m = c.move(san);
        if (!m) break;
        fens.push(c.fen());
      }
    } catch { /* ignore */ }
    return fens;
  }, [match.pgn]);

  useEffect(() => { setPly(positions.length - 1); }, [positions.length]);

  // Computa o melhor lance da posição visível (sob demanda) pra mostrar como seta
  useEffect(() => {
    setBestArrow(null);
    if (!showBestArrow) return;
    if (ply >= positions.length - 1) return; // posição final, sem "melhor lance"
    const fen = positions[ply];
    if (!fen) return;
    let cancelled = false;
    void (async () => {
      try {
        const sf = getStockfish();
        await sf.init();
        const r = await sf.evaluateFull(fen, 12);
        if (cancelled || !r.bestUci || r.bestUci.length < 4) return;
        const from = r.bestUci.slice(0, 2);
        const to   = r.bestUci.slice(2, 4);
        setBestArrow([from, to, "rgba(80,200,120,0.85)"]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [ply, positions, showBestArrow]);

  // SAN list pareada
  const pairs = useMemo(() => {
    if (!match.pgn) return [];
    const tokens = match.pgn
      .replace(/\{[^}]*\}/g, "")
      .replace(/\([^)]*\)/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !/^(\[|1-0|0-1|1\/2-1\/2|\*$)/.test(t));
    const result: { num: number; w?: string; b?: string; wIdx?: number; bIdx?: number }[] = [];
    let plyIdx = 0;
    for (const t of tokens) {
      const m = t.match(/^(\d+)\.+$/);
      if (m) result.push({ num: Number(m[1]) });
      else if (result.length) {
        const last = result[result.length - 1];
        if (!last.w) { last.w = t; last.wIdx = ++plyIdx; }
        else if (!last.b) { last.b = t; last.bIdx = ++plyIdx; }
      }
    }
    return result;
  }, [match.pgn]);

  // Tenta server primeiro (cache rápido). Se 503 (Stockfish indisponível),
  // cai pra Stockfish WASM local.
  const requestAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setProgress(null);
    try {
      // 1. Server-side (rápido se Stockfish estiver disponível, ou se já em cache)
      const res = await fetch(`/api/matches/${match.id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setAnalysis(data.analysis);
        setAnalyzed(true);
        return;
      }
      if (!data.unavailable) {
        setError(data.error ?? "Erro");
        return;
      }

      // 2. Fallback: Stockfish WASM no browser
      const sf = getStockfish();
      await sf.init();

      // Reconstrói cada FEN da partida
      const fens: string[] = [];
      const chess = new Chess();
      fens.push(chess.fen());
      const tokens = (match.pgn ?? "")
        .replace(/\{[^}]*\}/g, "")
        .replace(/\([^)]*\)/g, "")
        .split(/\s+/)
        .filter((t) => t && !/^(\d+\.+|1-0|0-1|1\/2|½|\*)/.test(t));
      for (const san of tokens) {
        const m = chess.move(san);
        if (!m) break;
        fens.push(chess.fen());
      }

      const total = fens.length - 1;
      if (total === 0) {
        setError("Partida sem lances para analisar");
        return;
      }
      setProgress({ done: 0, total });

      let whiteCpl = 0, blackCpl = 0, wc = 0, bc = 0;
      const allCpls: number[] = [];

      // Avalia depth 10 — bom equilíbrio entre precisão e velocidade
      const depth = 10;
      let prevCp = (await sf.evaluate(fens[0], depth)).cp;
      for (let i = 1; i <= total; i++) {
        const currentCp = (await sf.evaluate(fens[i], depth)).cp;
        const moverPrevCp = prevCp;
        const moverNewCp  = -currentCp;
        const cpl = Math.max(0, moverPrevCp - moverNewCp);
        allCpls.push(cpl);

        const movedWhite = (i % 2) === 1;
        if (movedWhite) { whiteCpl += cpl; wc++; }
        else            { blackCpl += cpl; bc++; }

        prevCp = currentCp;
        setProgress({ done: i, total });
      }

      const whiteAvgCpl = wc > 0 ? whiteCpl / wc : 0;
      const blackAvgCpl = bc > 0 ? blackCpl / bc : 0;
      const accuracy = (cpl: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * cpl) - 3.1669));
      const result = {
        white_avg_cpl:  whiteAvgCpl,
        black_avg_cpl:  blackAvgCpl,
        white_accuracy: accuracy(whiteAvgCpl),
        black_accuracy: accuracy(blackAvgCpl),
      };
      setAnalysis(result);
      setAnalyzed(true);
      setMoveCpls(allCpls);

      // Persiste no banco (não bloqueante)
      void fetch(`/api/matches/${match.id}/analysis-persist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          whiteAvgCpl:   result.white_avg_cpl,
          blackAvgCpl:   result.black_avg_cpl,
          whiteAccuracy: result.white_accuracy,
          blackAccuracy: result.black_accuracy,
          moveCpls:      allCpls.map((c) => Math.round(c)),
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }, [match.id, match.pgn]);

  const currentFen = positions[ply] ?? positions[0];

  const myColor = match.white_user_id === viewerId ? "w" : match.black_user_id === viewerId ? "b" : null;
  const iWon = match.winner_id === viewerId;
  const isDraw = match.result?.includes("DRAW");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Análise da partida</h1>
          <p className="text-xs text-muted">
            #{match.id.slice(-6)} · {match.move_count} lances ·{" "}
            {isDraw ? "Empate" : iWon ? "Vitória" : isPlayer ? "Derrota" : "Encerrada"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadPgn({
              matchId: match.id,
              pgn: match.pgn,
              whiteName: match.white_user?.username ?? "?",
              blackName: match.black_user?.username ?? (isBotMatch ? "Bot" : "?"),
              whiteRating: match.white_user?.rating,
              blackRating: match.black_user?.rating,
              result: match.result,
              finishedAt: null,
              timeControlSeconds: null,
              timeIncrementSeconds: 0,
            })}
            className="btn-secondary text-xs"
          >📥 PGN</button>
          <Link href={`/match/${match.id}`} className="btn-secondary text-xs">← Partida</Link>
          <Link href="/lobby" className="btn-secondary text-xs">Lobby</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Board column */}
        <div className="mx-auto w-full max-w-[min(85vh,100%)] space-y-2 lg:max-w-none">
          {/* Top player */}
          <PlayerLine
            user={orientation === "white" ? match.black_user : match.white_user}
            color={orientation === "white" ? "b" : "w"}
            accuracy={orientation === "white" ? analysis.black_accuracy : analysis.white_accuracy}
            cpl={orientation === "white" ? analysis.black_avg_cpl : analysis.white_avg_cpl}
            isWinner={
              (orientation === "white" ? "b" : "w") === "w"
                ? match.result === "WHITE_WIN" || match.result === "BLACK_RESIGN" || match.result === "BLACK_TIMEOUT"
                : match.result === "BLACK_WIN" || match.result === "WHITE_RESIGN" || match.result === "WHITE_TIMEOUT"
            }
            isMe={(orientation === "white" ? match.black_user_id : match.white_user_id) === viewerId}
          />

          <Chessboard
            position={currentFen}
            boardOrientation={orientation}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
            customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
            customArrows={(bestArrow ? [bestArrow] : []) as never[]}
            showBoardNotation
            customBoardStyle={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.65)" }}
          />

          {/* Bottom player */}
          <PlayerLine
            user={orientation === "white" ? match.white_user : match.black_user}
            color={orientation === "white" ? "w" : "b"}
            accuracy={orientation === "white" ? analysis.white_accuracy : analysis.black_accuracy}
            cpl={orientation === "white" ? analysis.white_avg_cpl : analysis.black_avg_cpl}
            isWinner={
              (orientation === "white" ? "w" : "b") === "w"
                ? match.result === "WHITE_WIN" || match.result === "BLACK_RESIGN" || match.result === "BLACK_TIMEOUT"
                : match.result === "BLACK_WIN" || match.result === "WHITE_RESIGN" || match.result === "WHITE_TIMEOUT"
            }
            isMe={myColor === (orientation === "white" ? "w" : "b")}
          />

          {/* Nav */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button onClick={() => setPly(0)}                disabled={ply === 0} className="rounded border border-border bg-surfaceAlt px-2 py-1 text-xs hover:border-accent/50 disabled:opacity-30">⏮</button>
            <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} className="rounded border border-border bg-surfaceAlt px-2 py-1 text-xs hover:border-accent/50 disabled:opacity-30">◀</button>
            <span className="text-xs text-muted font-mono">
              {ply}/{positions.length - 1}
            </span>
            <button onClick={() => setPly((p) => Math.min(positions.length - 1, p + 1))} disabled={ply >= positions.length - 1} className="rounded border border-border bg-surfaceAlt px-2 py-1 text-xs hover:border-accent/50 disabled:opacity-30">▶</button>
            <button onClick={() => setPly(positions.length - 1)}                                disabled={ply >= positions.length - 1} className="rounded border border-border bg-surfaceAlt px-2 py-1 text-xs hover:border-accent/50 disabled:opacity-30">⏭</button>
            <button
              onClick={() => setShowBestArrow((v) => !v)}
              title="Sugerir melhor lance (Stockfish)"
              className={`ml-2 rounded border px-2 py-1 text-xs transition-colors ${
                showBestArrow ? "border-success/60 bg-success/10 text-success" : "border-border bg-surfaceAlt text-muted hover:border-accent/50"
              }`}
            >🎯 Dica</button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          {/* Análise card */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Análise Stockfish</h3>
              {analyzed && <span className="badge-success text-[10px]">Concluída</span>}
            </div>

            {!analyzed && !isBotMatch && (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  Stockfish vai avaliar cada lance e calcular accuracy e CPL (perda em centipawns).
                </p>
                {!analyzing && (
                  <button
                    onClick={requestAnalysis}
                    className="btn-primary w-full text-sm"
                  >Solicitar análise</button>
                )}
                {analyzing && progress === null && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    Carregando engine Stockfish (~7MB)…
                  </div>
                )}
                {analyzing && progress && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Analisando lance {progress.done}/{progress.total}</span>
                      <span className="font-mono text-accent">{Math.round((progress.done / progress.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surfaceAlt">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {error && <p className="text-xs text-danger">{error}</p>}
              </div>
            )}

            {isBotMatch && (
              <p className="text-xs text-muted">
                Análise não disponível para partidas vs bot.
              </p>
            )}

            {analyzed && (
              <div className="space-y-2">
                <AccuracyRow
                  label={`@${match.white_user?.username ?? "?"}`}
                  color="w"
                  accuracy={analysis.white_accuracy}
                  cpl={analysis.white_avg_cpl}
                />
                <AccuracyRow
                  label={`@${match.black_user?.username ?? "?"}`}
                  color="b"
                  accuracy={analysis.black_accuracy}
                  cpl={analysis.black_avg_cpl}
                />
                <p className="pt-1 text-[10px] text-muted">
                  Accuracy aproxima o modelo do chess.com. CPL = centipawn loss médio.
                </p>
              </div>
            )}
          </div>

          {/* Move list */}
          <div className="card">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Lances <span className="text-white">({match.move_count})</span>
            </h3>
            <div className="scrollbar-thin max-h-80 overflow-y-auto">
              <ol className="space-y-0.5 font-mono text-xs">
                {pairs.map((p) => {
                  // moveCpls é 0-based pra plies (i=0 é primeiro lance, white)
                  const wCpl = p.wIdx ? moveCpls?.[p.wIdx - 1] : undefined;
                  const bCpl = p.bIdx ? moveCpls?.[p.bIdx - 1] : undefined;
                  const wMark = wCpl != null ? moveMark(wCpl) : null;
                  const bMark = bCpl != null ? moveMark(bCpl) : null;
                  return (
                    <li key={p.num} className="flex gap-2 rounded px-1 py-0.5 hover:bg-surfaceAlt">
                      <span className="w-5 shrink-0 text-muted">{p.num}.</span>
                      <button
                        onClick={() => p.wIdx && setPly(p.wIdx)}
                        title={wMark ? `${wMark.label} (${wCpl?.toFixed(0)} cpl)` : (wCpl != null ? `${wCpl.toFixed(0)} cpl` : "")}
                        className={`flex w-20 shrink-0 cursor-pointer items-center gap-1 rounded px-1 text-left hover:bg-accent/10 ${
                          p.wIdx === ply ? "bg-accent/30 font-bold text-accent" : ""
                        }`}
                      >
                        <span className="truncate">{p.w ?? ""}</span>
                        {wMark && <span className={`text-[10px] ${wMark.color}`}>{wMark.mark}</span>}
                      </button>
                      <button
                        onClick={() => p.bIdx && setPly(p.bIdx)}
                        title={bMark ? `${bMark.label} (${bCpl?.toFixed(0)} cpl)` : (bCpl != null ? `${bCpl.toFixed(0)} cpl` : "")}
                        className={`flex w-20 shrink-0 cursor-pointer items-center gap-1 rounded px-1 text-left hover:bg-accent/10 ${
                          p.bIdx === ply ? "bg-accent/30 font-bold text-accent" : ""
                        }`}
                      >
                        <span className="truncate">{p.b ?? ""}</span>
                        {bMark && <span className={`text-[10px] ${bMark.color}`}>{bMark.mark}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            {moveCpls && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
                <span><span className="text-success">✓</span> preciso</span>
                <span><span className="text-yellow-400">?!</span> imprecisão</span>
                <span><span className="text-red-400">?</span> erro</span>
                <span><span className="text-danger">??</span> blunder</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PlayerLine({
  user, color, accuracy, cpl, isWinner, isMe,
}: {
  user: Player;
  color: "w" | "b";
  accuracy: number | null;
  cpl: number | null;
  isWinner: boolean;
  isMe: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${color === "w" ? "border-white/25 bg-white/10" : "border-white/10 bg-black/25"} text-base`}>
          {color === "w" ? "♔" : "♚"}
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{user ? (isMe ? "Você" : `@${user.username}`) : "Bot"}</span>
            {user && <span className="text-[10px] text-muted">{user.rating}</span>}
            {isWinner && <span className="text-[10px] text-accent">👑</span>}
          </div>
        </div>
      </div>
      <div className="text-right text-xs">
        {accuracy != null ? (
          <>
            <div className="font-mono text-success">{accuracy.toFixed(1)}%</div>
            <div className="text-[10px] text-muted">CPL {cpl?.toFixed(1) ?? "—"}</div>
          </>
        ) : (
          <span className="text-[10px] text-muted">sem análise</span>
        )}
      </div>
    </div>
  );
}

function AccuracyRow({
  label, color, accuracy, cpl,
}: {
  label: string;
  color: "w" | "b";
  accuracy: number | null;
  cpl: number | null;
}) {
  const acc = accuracy ?? 0;
  const tone = acc >= 90 ? "text-success" : acc >= 75 ? "text-accent" : acc >= 60 ? "text-yellow-400" : "text-danger";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span>{color === "w" ? "♔" : "♚"}</span>
          <span className="text-muted">{label}</span>
        </span>
        <span className={`font-mono font-semibold ${tone}`}>{accuracy?.toFixed(1) ?? "—"}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surfaceAlt">
        <div
          className={`h-full ${acc >= 90 ? "bg-success" : acc >= 75 ? "bg-accent" : acc >= 60 ? "bg-yellow-400" : "bg-danger"}`}
          style={{ width: `${Math.max(2, Math.min(100, acc))}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-muted">CPL médio {cpl?.toFixed(1) ?? "—"}</div>
    </div>
  );
}
