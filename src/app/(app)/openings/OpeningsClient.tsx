"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamicLoad from "next/dynamic";
import Link from "next/link";
import { Chess } from "chess.js";
import { play as playSound } from "@/lib/sounds";
import { detectOpening, bookContinuations, OPENING_BOOK, type OpeningEntry } from "@/lib/openings";
import { getBoardPrefs, animDurationMs } from "@/lib/board-prefs";
import { getCustomPieces } from "@/lib/piece-sets";

const Chessboard = dynamicLoad(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

export function OpeningsClient() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [boardPrefs, setBoardPrefs] = useState(() => getBoardPrefs());
  useEffect(() => { setBoardPrefs(getBoardPrefs()); }, []);

  const sync = useCallback(() => {
    setFen(chess.fen());
    setHistory(chess.history());
    setSelected(null);
  }, [chess]);

  const tryMove = useCallback((from: string, to: string): boolean => {
    try {
      const m = chess.move({ from, to, promotion: "q" });
      if (!m) return false;
      playSound(chess.inCheck() ? "check" : m.captured ? "capture" : "move");
      sync();
      return true;
    } catch {
      return false;
    }
  }, [chess, sync]);

  const playSan = useCallback((san: string) => {
    try {
      const m = chess.move(san);
      if (!m) return;
      playSound(chess.inCheck() ? "check" : m.captured ? "capture" : "move");
      sync();
    } catch { /* ignore */ }
  }, [chess, sync]);

  const undo = useCallback(() => {
    chess.undo();
    playSound("click");
    sync();
  }, [chess, sync]);

  const reset = useCallback(() => {
    chess.reset();
    playSound("click");
    sync();
  }, [chess, sync]);

  const loadLine = useCallback((entry: OpeningEntry) => {
    chess.reset();
    for (const san of entry.moves) {
      try { chess.move(san); } catch { break; }
    }
    playSound("start");
    sync();
  }, [chess, sync]);

  const onSquareClick = useCallback((square: string) => {
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      if (tryMove(selected, square)) return;
      const piece = chess.get(square as never);
      if (piece && piece.color === chess.turn()) setSelected(square);
      else setSelected(null);
      return;
    }
    const piece = chess.get(square as never);
    if (piece && piece.color === chess.turn()) setSelected(square);
  }, [selected, tryMove, chess]);

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
    return styles;
  }, [selected, chess, fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const openingName = useMemo(() => detectOpening(history), [history]);
  const continuations = useMemo(() => bookContinuations(history), [history]);

  const filteredBook = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...OPENING_BOOK].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter((e) => e.name.toLowerCase().includes(q));
  }, [search]);

  const movePairs = useMemo(() => {
    const pairs: { num: number; w?: string; b?: string }[] = [];
    for (let i = 0; i < history.length; i++) {
      if (i % 2 === 0) pairs.push({ num: i / 2 + 1, w: history[i] });
      else pairs[pairs.length - 1].b = history[i];
    }
    return pairs;
  }, [history]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:gap-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">📖 Explorador de <span className="text-accent">Aberturas</span></h1>
            <p className="text-xs text-muted">
              Jogue lances no tabuleiro (pelos dois lados) e veja o nome da linha e as continuações do livro.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={undo} disabled={history.length === 0} className="btn-secondary py-1.5 text-xs disabled:opacity-40">↩ Voltar</button>
            <button onClick={reset} disabled={history.length === 0} className="btn-secondary py-1.5 text-xs disabled:opacity-40">↻ Zerar</button>
          </div>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Posição atual</div>
          <div className="text-sm font-semibold text-accent">
            {openingName ?? (history.length === 0 ? "Posição inicial — jogue um lance" : "Fora do livro")}
          </div>
        </div>

        <Chessboard
          position={fen}
          onPieceDrop={(from: string, to: string) => tryMove(from, to)}
          onSquareClick={onSquareClick}
          customSquareStyles={squareStyles}
          customBoardStyle={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.55)" }}
          customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
          customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
          showBoardNotation={boardPrefs.showNotation}
          animationDuration={animDurationMs(boardPrefs.animSpeed)}
          customPieces={getCustomPieces(boardPrefs.pieceSet) as never}
        />

        {movePairs.length > 0 && (
          <div className="card py-3">
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
              {movePairs.map((p) => (
                <span key={p.num}>
                  <span className="text-muted">{p.num}.</span> {p.w} {p.b ?? ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Continuações do livro {continuations.length > 0 && <span className="text-white">({continuations.length})</span>}
          </h2>
          {continuations.length === 0 ? (
            <p className="text-xs text-muted">
              {history.length === 0 ? "Carregando…" : "Sem continuações catalogadas — você saiu do livro. Continue explorando livre!"}
            </p>
          ) : (
            <ul className="space-y-1">
              {continuations.map((c) => (
                <li key={c.san}>
                  <button
                    onClick={() => playSan(c.san)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-white"
                  >
                    <span className="font-mono font-bold text-accent">{c.san}</span>
                    <span className="truncate text-right text-[11px]">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Todas as linhas ({filteredBook.length})</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar abertura… (ex: Siciliana)"
            className="input h-8 text-xs"
          />
          <ul className="scrollbar-thin max-h-[45vh] space-y-1 overflow-y-auto pr-1">
            {filteredBook.map((e, i) => (
              <li key={`${e.name}-${i}`}>
                <button
                  onClick={() => loadLine(e)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent/50 hover:text-white"
                >
                  <div className="font-medium text-white">{e.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] opacity-70">
                    {e.moves.slice(0, 8).map((m, j) => (j % 2 === 0 ? `${j / 2 + 1}.${m}` : m)).join(" ")}
                    {e.moves.length > 8 ? " …" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <Link href="/lobby" className="btn-secondary block py-2 text-center text-xs">← Voltar ao lobby</Link>
      </aside>
    </div>
  );
}
