"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicLoad from "next/dynamic";
import Link from "next/link";
import { Chess } from "chess.js";
import { play as playSound } from "@/lib/sounds";
import { PUZZLE_BANK, type PuzzleDef, themeLabel } from "@/lib/puzzles";

const Chessboard = dynamicLoad(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Status = "intro" | "playing" | "wrong" | "solved" | "shown";

type StoredState = {
  lastDay: string;
  streak: number;
  totalSolved: number;
  totalAttempts: number;
  byPuzzle: Record<string, { solved: boolean; hintsUsed: number; timeMs: number; mistakes: number }>;
  favorites: string[];
};

const STORAGE_KEY = "xa.puzzle.v1";

function loadState(): StoredState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as StoredState;
    return {
      lastDay: parsed.lastDay ?? "",
      streak: parsed.streak ?? 0,
      totalSolved: parsed.totalSolved ?? 0,
      totalAttempts: parsed.totalAttempts ?? 0,
      byPuzzle: parsed.byPuzzle ?? {},
      favorites: parsed.favorites ?? [],
    };
  } catch {
    return emptyState();
  }
}

function emptyState(): StoredState {
  return { lastDay: "", streak: 0, totalSolved: 0, totalAttempts: 0, byPuzzle: {}, favorites: [] };
}

type RatingFilter = "all" | "easy" | "medium" | "hard";
const RATING_FILTERS: { value: RatingFilter; label: string; min: number; max: number }[] = [
  { value: "all",    label: "Todos",  min: 0,    max: 9999 },
  { value: "easy",   label: "Fácil",  min: 0,    max: 800 },
  { value: "medium", label: "Médio",  min: 801,  max: 1300 },
  { value: "hard",   label: "Difícil",min: 1301, max: 9999 },
];

function saveState(s: StoredState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function dayDiff(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const ta = Date.parse(a + "T00:00:00Z");
  const tb = Date.parse(b + "T00:00:00Z");
  return Math.round((tb - ta) / 86_400_000);
}

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function PuzzleClient({ puzzle, dayKey }: { puzzle: PuzzleDef; dayKey: string }) {
  const [chess] = useState(() => new Chess(puzzle.fen));
  const [fen, setFen] = useState(chess.fen());
  const [status, setStatus] = useState<Status>("intro");
  const [moveIdx, setMoveIdx] = useState(0);          // próximo lance esperado em puzzle.moves
  const [hintsUsed, setHintsUsed] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stored, setStored] = useState<StoredState>(emptyState);
  const [practiceList] = useState<PuzzleDef[]>(() => [...PUZZLE_BANK].sort((a, b) => a.rating - b.rating));
  const [currentId, setCurrentId] = useState(puzzle.id);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [themeFilter, setThemeFilter] = useState<string>("");
  const [hideSolved, setHideSolved] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const isDailyRef = useRef(currentId === puzzle.id);

  // Carrega estado salvo
  useEffect(() => { setStored(loadState()); }, []);

  // Cronômetro
  useEffect(() => {
    if (status !== "playing" || !startedAt) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(t);
  }, [status, startedAt]);

  // Cor que o jogador joga (sempre responde ao lance pré-feito do oponente)
  const playerColor: "w" | "b" = useMemo(() => {
    const probe = new Chess(puzzle.fen);
    return probe.turn() === "w" ? "b" : "w";
  }, [puzzle.fen]);

  const startPuzzle = useCallback(() => {
    chess.load(puzzle.fen);
    if (puzzle.moves.length > 0) {
      const first = uciToMove(puzzle.moves[0]);
      try { chess.move(first); } catch { /* ignore */ }
    }
    setFen(chess.fen());
    setMoveIdx(1);
    setHintsUsed(0);
    setMistakes(0);
    setHint(null);
    setSelected(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setStatus("playing");
    playSound("click");
  }, [chess, puzzle]);

  const showSolution = useCallback(() => {
    chess.load(puzzle.fen);
    for (const uci of puzzle.moves) {
      try { chess.move(uciToMove(uci)); } catch { /* ignore */ }
    }
    setFen(chess.fen());
    setMoveIdx(puzzle.moves.length);
    setStatus("shown");
    setHint(null);
  }, [chess, puzzle]);

  const useHint = useCallback(() => {
    if (status !== "playing") return;
    const next = puzzle.moves[moveIdx];
    if (!next) return;
    const from = next.slice(0, 2);
    const to = next.slice(2, 4);
    // Dica adaptativa: revela mais conforme erros/dicas anteriores
    const level = Math.min(2, hintsUsed + Math.floor(mistakes / 2));
    if (level === 0) {
      setHint(`A peça correta sai de ${from.toUpperCase()}`);
    } else if (level === 1) {
      setHint(`Movimente a peça de ${from.toUpperCase()} pra uma casa importante…`);
    } else {
      setHint(`A solução é ${from.toUpperCase()} → ${to.toUpperCase()}`);
    }
    setHintsUsed((h) => h + 1);
    playSound("notify");
  }, [puzzle, moveIdx, status, hintsUsed, mistakes]);

  const tryMove = useCallback((from: string, to: string, promotion?: string) => {
    if (status !== "playing") return false;
    const next = puzzle.moves[moveIdx];
    if (!next) return false;
    const expected = uciToMove(next);
    const isCorrect = expected.from === from && expected.to === to &&
      (expected.promotion ? expected.promotion === promotion : true);

    if (!isCorrect) {
      // Validamos o lance pra ver se é legal (visual)
      const probe = new Chess(chess.fen());
      const result = probe.move({ from, to, promotion: promotion ?? "q" });
      if (!result) return false;
      setMistakes((m) => m + 1);
      setStatus("wrong");
      playSound("loseSelf");
      // Reverte a tentativa visualmente
      setTimeout(() => {
        if (chess.fen() === fen) {
          setStatus("playing");
        }
      }, 800);
      return false;
    }

    try { chess.move({ from, to, promotion }); } catch { return false; }
    const isCheck = chess.inCheck();
    playSound(isCheck ? "check" : "move");
    setFen(chess.fen());
    setHint(null);
    setSelected(null);

    const afterUserIdx = moveIdx + 1;
    const reply = puzzle.moves[afterUserIdx];
    if (reply) {
      setTimeout(() => {
        try { chess.move(uciToMove(reply)); } catch { /* ignore */ }
        setFen(chess.fen());
        playSound("move");
        const afterReplyIdx = afterUserIdx + 1;
        setMoveIdx(afterReplyIdx);
        if (afterReplyIdx >= puzzle.moves.length) finalizeSolved();
      }, 400);
      setMoveIdx(afterUserIdx);
    } else {
      setMoveIdx(afterUserIdx);
      finalizeSolved();
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, moveIdx, status, chess, fen]);

  const finalizeSolved = useCallback(() => {
    setStatus("solved");
    playSound("winSelf");
    setStored((prev) => {
      const ms = startedAt ? Date.now() - startedAt : 0;
      const existing = prev.byPuzzle[currentId];
      const isNewSolve = !existing?.solved;
      const next: StoredState = {
        ...prev,
        totalSolved: prev.totalSolved + (isNewSolve ? 1 : 0),
        totalAttempts: prev.totalAttempts + 1,
        byPuzzle: {
          ...prev.byPuzzle,
          [currentId]: {
            solved: true,
            hintsUsed,
            timeMs: ms,
            mistakes,
          },
        },
      };
      // Atualiza streak se for o puzzle do dia
      if (isDailyRef.current && currentId === puzzle.id) {
        const diff = dayDiff(prev.lastDay, dayKey);
        next.streak = diff === 1 ? prev.streak + 1 : (diff === 0 ? prev.streak || 1 : 1);
        next.lastDay = dayKey;
      }
      saveState(next);
      return next;
    });
  }, [currentId, puzzle.id, dayKey, hintsUsed, mistakes, startedAt]);

  const goToPuzzle = useCallback((id: string) => {
    const target = PUZZLE_BANK.find((p) => p.id === id);
    if (!target) return;
    setCurrentId(id);
    isDailyRef.current = id === puzzle.id;
    chess.load(target.fen);
    setFen(chess.fen());
    setStatus("intro");
    setMoveIdx(0);
    setHint(null);
    setHintsUsed(0);
    setMistakes(0);
    setSelected(null);
    setStartedAt(null);
    setElapsed(0);
  }, [chess, puzzle.id]);

  const onPieceDrop = useCallback((from: string, to: string, piece: string) => {
    if (status !== "playing") return false;
    const promotion = piece && piece.endsWith("P") && (to[1] === "8" || to[1] === "1") ? "q" : undefined;
    return tryMove(from, to, promotion);
  }, [status, tryMove]);

  const onSquareClick = useCallback((square: string) => {
    if (status !== "playing") return;
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      const ok = tryMove(selected, square);
      if (!ok) {
        const piece = chess.get(square as never);
        if (piece && piece.color === playerColor) setSelected(square);
        else setSelected(null);
      }
      return;
    }
    const piece = chess.get(square as never);
    if (piece && piece.color === playerColor) setSelected(square);
  }, [status, selected, tryMove, chess, playerColor]);

  // Highlights
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selected) {
      styles[selected] = { backgroundColor: "rgba(245,179,1,0.35)" };
      const moves = chess.moves({ square: selected as never, verbose: true });
      for (const m of moves as Array<{ to: string; captured?: string }>) {
        styles[m.to] = m.captured
          ? { background: "radial-gradient(circle, rgba(245,179,1,0.4) 65%, transparent 70%)" }
          : { background: "radial-gradient(circle, rgba(245,179,1,0.55) 22%, transparent 25%)" };
      }
    }
    if (hint) {
      // Suporta padrões "E2" e "E2 → E4"
      const m = Array.from(hint.matchAll(/([A-H][1-8])/gi));
      if (m.length >= 1) styles[m[0][1].toLowerCase()] = { backgroundColor: "rgba(96,165,255,0.45)" };
      if (m.length >= 2) styles[m[1][1].toLowerCase()] = { backgroundColor: "rgba(96,165,255,0.35)" };
    }
    if (status === "wrong") {
      const lastTry = puzzle.moves[moveIdx];
      if (lastTry) {
        styles[lastTry.slice(2, 4)] = { backgroundColor: "rgba(225,82,82,0.6)" };
      }
    }
    return styles;
  }, [selected, hint, status, chess, puzzle.moves, moveIdx]);

  const currentPuzzle = useMemo(
    () => PUZZLE_BANK.find((p) => p.id === currentId) ?? puzzle,
    [currentId, puzzle],
  );

  const sideToMoveLabel = playerColor === "w" ? "Brancas" : "Pretas";
  const solvedById = stored.byPuzzle[currentId]?.solved;
  const isFavoriteCurrent = stored.favorites.includes(currentId);

  const allThemes = useMemo(() => {
    const s = new Set<string>();
    for (const p of PUZZLE_BANK) for (const t of p.themes) s.add(t);
    return Array.from(s).sort();
  }, []);

  const filteredPractice = useMemo(() => {
    const r = RATING_FILTERS.find((rf) => rf.value === ratingFilter)!;
    return practiceList.filter((p) => {
      if (p.rating < r.min || p.rating > r.max) return false;
      if (themeFilter && !p.themes.includes(themeFilter)) return false;
      if (hideSolved && stored.byPuzzle[p.id]?.solved) return false;
      if (onlyFavorites && !stored.favorites.includes(p.id)) return false;
      return true;
    });
  }, [practiceList, ratingFilter, themeFilter, hideSolved, onlyFavorites, stored]);

  const toggleFavorite = useCallback((id: string) => {
    setStored((prev) => {
      const set = new Set(prev.favorites);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const next = { ...prev, favorites: Array.from(set) };
      saveState(next);
      return next;
    });
  }, []);

  const pickRandom = useCallback(() => {
    const pool = filteredPractice.length > 0 ? filteredPractice : practiceList;
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (target) goToPuzzle(target.id);
  }, [filteredPractice, practiceList, goToPuzzle]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:gap-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🧩 Puzzle <span className="text-accent">{isDailyRef.current ? "do Dia" : "de Treino"}</span>
            </h1>
            <p className="text-xs text-muted">
              {sideToMoveLabel} jogam — encontre o melhor lance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="badge">Rating {currentPuzzle.rating}</span>
            {currentPuzzle.themes.slice(0, 3).map((t) => (
              <span key={t} className="badge">{themeLabel(t)}</span>
            ))}
            {solvedById && <span className="badge-success">✓ Resolvido</span>}
            <button
              onClick={() => toggleFavorite(currentId)}
              className={`rounded-full border px-2 py-0.5 transition-colors ${
                isFavoriteCurrent
                  ? "border-yellow-400 bg-yellow-400/15 text-yellow-300"
                  : "border-border text-muted hover:border-yellow-400/40 hover:text-yellow-300"
              }`}
              title={isFavoriteCurrent ? "Remover dos favoritos" : "Marcar como favorito"}
            >
              {isFavoriteCurrent ? "★" : "☆"} favorito
            </button>
          </div>
        </div>

        <div className="relative">
          <Chessboard
            position={fen}
            boardOrientation={playerColor === "w" ? "white" : "black"}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            arePiecesDraggable={status === "playing"}
            customSquareStyles={squareStyles}
            customBoardStyle={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.55)" }}
            customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
            customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
            showBoardNotation
          />
          {status === "wrong" && (
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-md ring-4 ring-danger/40" />
          )}
          {status === "solved" && (
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-md ring-4 ring-success/40" />
          )}
        </div>

        {/* Status bar */}
        <div className="card flex flex-wrap items-center justify-between gap-3 py-3">
          {status === "intro" && (
            <>
              <p className="text-sm text-muted">
                Posição carregada. Quando clicar em "Iniciar", o adversário vai jogar o último lance e seu desafio começa.
              </p>
              <button onClick={startPuzzle} className="btn-primary px-4 text-sm">▶ Iniciar</button>
            </>
          )}
          {status === "playing" && (
            <>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted">Tempo: <span className="text-white">{(elapsed/1000).toFixed(1)}s</span></span>
                <span className="text-muted">Erros: <span className="text-danger">{mistakes}</span></span>
                <span className="text-muted">Dicas: <span className="text-yellow-400">{hintsUsed}</span></span>
              </div>
              <div className="flex gap-2">
                <button onClick={useHint} disabled={!!hint} className="btn-secondary py-1 text-xs disabled:opacity-50">💡 Dica</button>
                <button onClick={showSolution} className="btn-secondary py-1 text-xs">👁 Ver solução</button>
                <button onClick={startPuzzle} className="btn-secondary py-1 text-xs">↻ Reiniciar</button>
              </div>
            </>
          )}
          {status === "wrong" && (
            <p className="text-sm text-danger">✗ Esse não é o melhor lance — tente outro.</p>
          )}
          {status === "solved" && (
            <>
              <div>
                <p className="text-sm text-success font-semibold">✓ Resolvido!</p>
                <p className="text-[11px] text-muted">
                  {(elapsed/1000).toFixed(1)}s · {mistakes} erro{mistakes === 1 ? "" : "s"} · {hintsUsed} dica{hintsUsed === 1 ? "" : "s"}
                </p>
              </div>
              <button onClick={() => goToPuzzle(nextPuzzleId(currentId))} className="btn-primary px-4 text-sm">
                Próximo →
              </button>
            </>
          )}
          {status === "shown" && (
            <>
              <p className="text-sm text-yellow-400">👁 Solução revelada. Tente outro!</p>
              <button onClick={() => goToPuzzle(nextPuzzleId(currentId))} className="btn-secondary px-4 text-sm">
                Próximo →
              </button>
            </>
          )}
        </div>

        {hint && status === "playing" && (
          <div className="rounded border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
            💡 {hint}
          </div>
        )}
      </div>

      {/* Sidebar: stats + lista */}
      <aside className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Suas estatísticas</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Sequência" value={stored.streak} suffix="🔥" />
            <Stat label="Total" value={stored.totalSolved} />
            <Stat label="Tentativas" value={stored.totalAttempts} />
          </div>
          {stored.lastDay && (
            <p className="text-[10px] text-muted">
              Última resolvida: {stored.lastDay}
            </p>
          )}
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Banco</h2>
            <button onClick={pickRandom} className="rounded border border-border bg-surfaceAlt px-2 py-0.5 text-[10px] text-muted hover:border-accent/40 hover:text-accent">
              🎲 Aleatório
            </button>
          </div>

          {/* Filtros */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {RATING_FILTERS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRatingFilter(r.value)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                    ratingFilter === r.value
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-border text-muted hover:border-accent/40"
                  }`}
                >{r.label}</button>
              ))}
            </div>
            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              className="input h-7 cursor-pointer text-[11px]"
            >
              <option value="">Todos os temas</option>
              {allThemes.map((t) => (
                <option key={t} value={t}>{themeLabel(t)}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 text-[10px] text-muted">
              <label className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={hideSolved} onChange={(e) => setHideSolved(e.target.checked)} className="h-3 w-3 accent-accent" />
                Ocultar resolvidos
              </label>
              <label className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} className="h-3 w-3 accent-yellow-400" />
                Só favoritos ★
              </label>
            </div>
            <p className="text-[10px] text-muted">{filteredPractice.length} de {practiceList.length} puzzles</p>
          </div>

          <ul className="scrollbar-thin max-h-[45vh] overflow-y-auto space-y-1 pr-1">
            {filteredPractice.length === 0 ? (
              <li className="rounded border border-border bg-surfaceAlt/30 px-2 py-3 text-center text-[11px] text-muted">
                Nenhum puzzle com esses filtros.
              </li>
            ) : filteredPractice.map((p) => {
              const isCurrent = p.id === currentId;
              const solved = stored.byPuzzle[p.id]?.solved;
              const isFav = stored.favorites.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => goToPuzzle(p.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      isCurrent
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:border-accent/40 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {solved ? <span className="text-success">✓</span> : <span className="opacity-30">○</span>}
                      {isFav && <span className="text-yellow-400">★</span>}
                      <span className="font-mono">{p.id}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span>{p.rating}</span>
                      <span className="text-[9px] opacity-70">{themeLabel(p.themes[0])}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <Link href="/lobby" className="btn-secondary block py-2 text-center text-xs">
          ← Voltar ao lobby
        </Link>
      </aside>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surfaceAlt/40 px-2 py-2">
      <div className="text-lg font-bold text-white">
        {value}{suffix && <span className="ml-1 text-base">{suffix}</span>}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function nextPuzzleId(currentId: string): string {
  const idx = PUZZLE_BANK.findIndex((p) => p.id === currentId);
  if (idx < 0) return PUZZLE_BANK[0].id;
  return PUZZLE_BANK[(idx + 1) % PUZZLE_BANK.length].id;
}
