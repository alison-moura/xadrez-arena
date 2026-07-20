"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicLoad from "next/dynamic";
import Link from "next/link";
import { Chess } from "chess.js";
import { play as playSound } from "@/lib/sounds";
import { PUZZLE_BANK, type PuzzleDef } from "@/lib/puzzles";
import { getBoardPrefs, animDurationMs } from "@/lib/board-prefs";

const Chessboard = dynamicLoad(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Mode = "5min" | "survival";
type Phase = "idle" | "running" | "over";

type RushRun = { mode: Mode; score: number; date: string };
type RushStore = {
  best5: number;
  bestSurvival: number;
  runs: RushRun[];
};

const STORAGE_KEY = "xa.puzzleRush.v1";
const RUSH_MS = 5 * 60 * 1000;
const MAX_STRIKES = 3;

function loadStore(): RushStore {
  if (typeof window === "undefined") return { best5: 0, bestSurvival: 0, runs: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { best5: 0, bestSurvival: 0, runs: [] };
    const p = JSON.parse(raw) as RushStore;
    return { best5: p.best5 ?? 0, bestSurvival: p.bestSurvival ?? 0, runs: p.runs ?? [] };
  } catch {
    return { best5: 0, bestSurvival: 0, runs: [] };
  }
}

function saveStore(s: RushStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// Fila de dificuldade crescente: ordena por rating, embaralha empates a cada run.
function buildQueue(): PuzzleDef[] {
  return [...PUZZLE_BANK]
    .map((p) => ({ p, jitter: Math.random() }))
    .sort((a, b) => a.p.rating - b.p.rating || a.jitter - b.jitter)
    .map((x) => x.p);
}

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PuzzleRushClient() {
  const chessRef = useRef(new Chess());
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("5min");
  const [queue, setQueue] = useState<PuzzleDef[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [moveIdx, setMoveIdx] = useState(0);
  const [fen, setFen] = useState("start");
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [results, setResults] = useState<{ id: string; rating: number; ok: boolean }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [store, setStore] = useState<RushStore>({ best5: 0, bestSurvival: 0, runs: [] });
  const [endReason, setEndReason] = useState<"time" | "strikes" | "cleared" | null>(null);
  const [boardPrefs, setBoardPrefs] = useState(() => getBoardPrefs());

  const deadlineRef = useRef(0);
  const startedAtRef = useRef(0);
  const lockedRef = useRef(false); // trava input durante transições/respostas do oponente
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setStore(loadStore());
    setBoardPrefs(getBoardPrefs());
    const t = timeoutsRef.current;
    return () => { t.forEach(clearTimeout); };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  const puzzle = queue[qIdx] ?? null;

  const playerColor: "w" | "b" = useMemo(() => {
    if (!puzzle) return "w";
    const probe = new Chess(puzzle.fen);
    return probe.turn() === "w" ? "b" : "w";
  }, [puzzle]);

  const endRun = useCallback((reason: "time" | "strikes" | "cleared", finalScore: number, finalMode: Mode) => {
    setPhase("over");
    setEndReason(reason);
    lockedRef.current = true;
    playSound(reason === "strikes" ? "loseSelf" : "winSelf");
    setStore((prev) => {
      const next: RushStore = {
        best5: finalMode === "5min" ? Math.max(prev.best5, finalScore) : prev.best5,
        bestSurvival: finalMode === "survival" ? Math.max(prev.bestSurvival, finalScore) : prev.bestSurvival,
        runs: [{ mode: finalMode, score: finalScore, date: new Date().toISOString().slice(0, 10) }, ...prev.runs].slice(0, 10),
      };
      saveStore(next);
      return next;
    });
  }, []);

  // Relógio do modo 5min
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (mode === "5min" && Date.now() >= deadlineRef.current) {
        setScore((s) => { endRun("time", s, mode); return s; });
      }
    }, 250);
    return () => clearInterval(t);
  }, [phase, mode, endRun]);

  const loadPuzzleAt = useCallback((list: PuzzleDef[], idx: number) => {
    const p = list[idx];
    if (!p) return;
    const chess = chessRef.current;
    chess.load(p.fen);
    setFen(chess.fen());
    setMoveIdx(0);
    setSelected(null);
    lockedRef.current = true;
    // Oponente joga o lance de abertura do puzzle
    later(() => {
      try { chess.move(uciToMove(p.moves[0])); } catch { /* ignore */ }
      setFen(chess.fen());
      setMoveIdx(1);
      lockedRef.current = false;
      playSound("move");
    }, 350);
  }, [later]);

  const startRun = useCallback((m: Mode) => {
    const q = buildQueue();
    setMode(m);
    setQueue(q);
    setQIdx(0);
    setScore(0);
    setStrikes(0);
    setResults([]);
    setEndReason(null);
    setFlash(null);
    setPhase("running");
    deadlineRef.current = Date.now() + RUSH_MS;
    startedAtRef.current = Date.now();
    setNow(Date.now());
    playSound("start");
    loadPuzzleAt(q, 0);
  }, [loadPuzzleAt]);

  const advance = useCallback((solved: boolean) => {
    if (!puzzle) return;
    const nextStrikes = strikes + (solved ? 0 : 1);
    const nextScore = score + (solved ? 1 : 0);
    setResults((r) => [...r, { id: puzzle.id, rating: puzzle.rating, ok: solved }]);
    setScore(nextScore);
    setStrikes(nextStrikes);
    setFlash(solved ? "good" : "bad");
    later(() => setFlash(null), 500);

    if (!solved && nextStrikes >= MAX_STRIKES) {
      later(() => endRun("strikes", nextScore, mode), 500);
      return;
    }
    const nextIdx = qIdx + 1;
    if (nextIdx >= queue.length) {
      later(() => endRun("cleared", nextScore, mode), 500);
      return;
    }
    setQIdx(nextIdx);
    later(() => loadPuzzleAt(queue, nextIdx), solved ? 350 : 650);
  }, [puzzle, strikes, score, qIdx, queue, mode, endRun, later, loadPuzzleAt]);

  const tryMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (phase !== "running" || lockedRef.current || !puzzle) return false;
    const expectedUci = puzzle.moves[moveIdx];
    if (!expectedUci) return false;
    const expected = uciToMove(expectedUci);
    const chess = chessRef.current;

    const isCorrect =
      expected.from === from && expected.to === to &&
      (expected.promotion ? expected.promotion === promotion : true);

    if (!isCorrect) {
      // só conta strike se o lance tentado era ao menos legal
      const probe = new Chess(chess.fen());
      let legal = null;
      try { legal = probe.move({ from, to, promotion: promotion ?? "q" }); } catch { /* ilegal */ }
      if (!legal) return false;
      playSound("loseSelf");
      lockedRef.current = true;
      setSelected(null);
      advance(false);
      return false;
    }

    try { chess.move({ from, to, promotion }); } catch { return false; }
    playSound(chess.inCheck() ? "check" : "move");
    setFen(chess.fen());
    setSelected(null);

    const afterUser = moveIdx + 1;
    const reply = puzzle.moves[afterUser];
    if (reply) {
      lockedRef.current = true;
      setMoveIdx(afterUser);
      later(() => {
        try { chess.move(uciToMove(reply)); } catch { /* ignore */ }
        setFen(chess.fen());
        playSound("move");
        const afterReply = afterUser + 1;
        setMoveIdx(afterReply);
        if (afterReply >= puzzle.moves.length) {
          advance(true);
        } else {
          lockedRef.current = false;
        }
      }, 380);
    } else {
      setMoveIdx(afterUser);
      lockedRef.current = true;
      playSound("notify");
      advance(true);
    }
    return true;
  }, [phase, puzzle, moveIdx, advance, later]);

  const onPieceDrop = useCallback((from: string, to: string, piece: string) => {
    const promotion = piece && piece.endsWith("P") && (to[1] === "8" || to[1] === "1") ? "q" : undefined;
    return tryMove(from, to, promotion);
  }, [tryMove]);

  const onSquareClick = useCallback((square: string) => {
    if (phase !== "running" || lockedRef.current) return;
    const chess = chessRef.current;
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      const piece = chess.get(square as never);
      if (piece && piece.color === playerColor) { setSelected(square); return; }
      const target = chess.get(square as never);
      void target;
      const moving = chess.get(selected as never);
      const promotion = moving?.type === "p" && (square[1] === "8" || square[1] === "1") ? "q" : undefined;
      tryMove(selected, square, promotion);
      setSelected(null);
      return;
    }
    const piece = chess.get(square as never);
    if (piece && piece.color === playerColor) setSelected(square);
  }, [phase, selected, playerColor, tryMove]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selected) {
      styles[selected] = { backgroundColor: "rgba(245,179,1,0.35)" };
      const moves = chessRef.current.moves({ square: selected as never, verbose: true });
      for (const m of moves as Array<{ to: string; captured?: string }>) {
        styles[m.to] = m.captured
          ? { background: "radial-gradient(circle, rgba(245,179,1,0.4) 65%, transparent 70%)" }
          : { background: "radial-gradient(circle, rgba(245,179,1,0.55) 22%, transparent 25%)" };
      }
    }
    return styles;
  }, [selected, fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = deadlineRef.current - now;
  const elapsed = now - startedAtRef.current;
  const best = mode === "5min" ? store.best5 : store.bestSurvival;
  const lowTime = phase === "running" && mode === "5min" && remaining < 30_000;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:gap-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              ⚡ Puzzle <span className="text-accent">Rush</span>
            </h1>
            <p className="text-xs text-muted">
              Resolva o máximo de puzzles em sequência. Dificuldade crescente — 3 erros e acabou.
            </p>
          </div>
          {phase === "running" && (
            <div className="flex items-center gap-3">
              <span className={`rounded-lg border border-border bg-surfaceAlt px-3 py-1.5 font-mono text-lg font-bold ${lowTime ? "animate-pulse text-danger" : "text-white"}`}>
                {mode === "5min" ? fmtClock(remaining) : fmtClock(elapsed)}
              </span>
              <span className="text-lg font-bold text-accent">{score}</span>
              <span className="font-mono text-sm tracking-widest">
                {Array.from({ length: MAX_STRIKES }, (_, i) => (
                  <span key={i} className={i < strikes ? "text-danger" : "text-muted opacity-30"}>✗</span>
                ))}
              </span>
            </div>
          )}
        </div>

        {phase === "idle" && (
          <div className="card space-y-4 py-8 text-center">
            <div className="text-5xl">⚡</div>
            <h2 className="text-xl font-bold">Pronto pro Rush?</h2>
            <p className="mx-auto max-w-md text-sm text-muted">
              Puzzles em sequência, do mais fácil ao mais difícil. Um lance errado = 1 strike e o
              puzzle é pulado. Três strikes encerram a corrida.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => startRun("5min")} className="btn-primary px-6 py-3 text-base">
                ▶ 5 minutos
                {store.best5 > 0 && <span className="ml-2 text-xs opacity-70">recorde {store.best5}</span>}
              </button>
              <button onClick={() => startRun("survival")} className="btn-secondary px-6 py-3 text-base">
                ∞ Sobrevivência
                {store.bestSurvival > 0 && <span className="ml-2 text-xs opacity-70">recorde {store.bestSurvival}</span>}
              </button>
            </div>
          </div>
        )}

        {phase !== "idle" && (
          <div className="relative">
            <Chessboard
              position={fen}
              boardOrientation={playerColor === "w" ? "white" : "black"}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              arePiecesDraggable={phase === "running"}
              customSquareStyles={squareStyles}
              customBoardStyle={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.55)" }}
              customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
              customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
              showBoardNotation={boardPrefs.showNotation}
              animationDuration={animDurationMs(boardPrefs.animSpeed)}
            />
            {flash === "bad" && (
              <div className="pointer-events-none absolute inset-0 rounded-md ring-4 ring-danger/50" />
            )}
            {flash === "good" && (
              <div className="pointer-events-none absolute inset-0 rounded-md ring-4 ring-success/50" />
            )}
            {phase === "over" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/70 backdrop-blur-sm">
                <div className="w-full max-w-sm space-y-3 px-6 text-center">
                  <div className="text-5xl">
                    {endReason === "cleared" ? "🏆" : endReason === "time" ? "⏰" : "💥"}
                  </div>
                  <h2 className="text-2xl font-bold">
                    {endReason === "cleared" ? "Banco zerado!" : endReason === "time" ? "Tempo esgotado" : "3 strikes"}
                  </h2>
                  <div className="text-4xl font-bold text-accent">{score}</div>
                  <p className="text-sm text-muted">
                    {score >= best && score > 0 ? "🎉 Novo recorde pessoal!" : `Recorde: ${best}`}
                  </p>
                  <div className="flex justify-center gap-2 pt-1">
                    <button onClick={() => startRun(mode)} className="btn-primary px-5 text-sm">↻ De novo</button>
                    <button onClick={() => setPhase("idle")} className="btn-secondary px-5 text-sm">Modos</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "running" && puzzle && (
          <div className="card flex items-center justify-between gap-3 py-3 text-xs text-muted">
            <span>
              Puzzle <span className="font-mono text-white">{qIdx + 1}</span> · rating{" "}
              <span className="text-white">{puzzle.rating}</span> ·{" "}
              {playerColor === "w" ? "Brancas" : "Pretas"} jogam
            </span>
            <span className="text-[10px]">lance errado = strike + pula puzzle</span>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recordes</h2>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-border bg-surfaceAlt/40 px-2 py-2">
              <div className="text-lg font-bold text-white">{store.best5}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted">5 minutos</div>
            </div>
            <div className="rounded-lg border border-border bg-surfaceAlt/40 px-2 py-2">
              <div className="text-lg font-bold text-white">{store.bestSurvival}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted">Sobrevivência</div>
            </div>
          </div>
        </div>

        {(phase === "running" || phase === "over") && results.length > 0 && (
          <div className="card space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Esta corrida</h2>
            <ul className="scrollbar-thin grid max-h-[40vh] grid-cols-4 gap-1 overflow-y-auto pr-1">
              {results.map((r, i) => (
                <li
                  key={`${r.id}-${i}`}
                  title={`${r.id} · rating ${r.rating}`}
                  className={`rounded border px-1 py-1 text-center text-[10px] font-mono ${
                    r.ok
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-danger/40 bg-danger/10 text-danger"
                  }`}
                >
                  {r.ok ? "✓" : "✗"} {r.rating}
                </li>
              ))}
            </ul>
          </div>
        )}

        {store.runs.length > 0 && phase !== "running" && (
          <div className="card space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Últimas corridas</h2>
            <ul className="space-y-1 text-xs">
              {store.runs.map((r, i) => (
                <li key={i} className="flex items-center justify-between rounded border border-border bg-surfaceAlt/30 px-2 py-1">
                  <span className="text-muted">{r.mode === "5min" ? "⚡ 5min" : "∞ Sobrev."} · {r.date}</span>
                  <span className="font-bold text-white">{r.score}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/puzzle" className="btn-secondary block py-2 text-center text-xs">
          🧩 Puzzle do Dia
        </Link>
        <Link href="/lobby" className="btn-secondary block py-2 text-center text-xs">
          ← Voltar ao lobby
        </Link>
      </aside>
    </div>
  );
}
