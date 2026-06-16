"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import Link from "next/link";
import { formatCoins } from "@/lib/utils";
import { SKIN_DEFS, RARITY_COLORS, RARITY_LABELS, type SkinRarity } from "@/lib/skins";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type MatchData = {
  id: string;
  wager: number;
  pot: number;
  payout: number;
  rake_bps: number;
  status: "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  result: string | null;
  fen: string;
  pgn: string;
  move_count: number;
  turn: string;
  creator_id: string;
  white_user_id: string | null;
  black_user_id: string | null;
  white_user: { id: string; username: string; rating: number; games_played?: number } | null;
  black_user: { id: string; username: string; rating: number; games_played?: number } | null;
  winner: { id: string; username: string } | null;
};

type EarnedAchievement = { id: string; name: string; icon: string; reward_coins: number };
type SkinDrop = { skin_id: string; skin_name: string; rarity: SkinRarity };

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_ORDER = ["q", "r", "b", "n", "p"];
const CAPTURED_SYMBOLS: Record<string, string> = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function calcMaterial(chess: Chess) {
  const initial: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const onBoard: Record<string, { w: number; b: number }> = {
    p: { w: 0, b: 0 }, n: { w: 0, b: 0 }, b: { w: 0, b: 0 }, r: { w: 0, b: 0 }, q: { w: 0, b: 0 },
  };
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== "k") onBoard[cell.type][cell.color]++;
    }
  }
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];
  let advantage = 0;
  for (const type of PIECE_ORDER) {
    const missingBlack = initial[type] - onBoard[type].b;
    const missingWhite = initial[type] - onBoard[type].w;
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(type);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(type);
    advantage += (missingBlack - missingWhite) * PIECE_VALUES[type];
  }
  return { capturedByWhite, capturedByBlack, advantage };
}

export function MatchClient({
  initialMatch,
  viewerId,
}: {
  initialMatch: MatchData;
  viewerId: string;
}) {
  const [match, setMatch] = useState<MatchData>(initialMatch);
  const [error, setError] = useState<string | null>(null);
  // `busy` blocks interaction (piece dragging) for the whole round trip, including
  // bot thinking time. `sendingMove` only covers our own request and drives the
  // spinner overlay — we don't want a loading screen while the bot "thinks".
  const [busy, setBusy] = useState(false);
  const [sendingMove, setSendingMove] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveStyles, setLegalMoveStyles] = useState<Record<string, React.CSSProperties>>({});
  const [premoveStyles, setPremoveStyles] = useState<Record<string, React.CSSProperties>>({});
  const [copied, setCopied] = useState<"fen" | "pgn" | null>(null);
  const [achievements, setAchievements] = useState<EarnedAchievement[]>([]);
  const [skinDrop, setSkinDrop] = useState<SkinDrop | null>(null);
  const [equippedSkinId, setEquippedSkinId] = useState("classic");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>("cheating");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const premoveRef = useRef<{ from: string; to: string } | null>(null);
  const achievementCheckedRef = useRef(false);
  const dropCheckedRef = useRef(false);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  // Load equipped skin once
  useEffect(() => {
    fetch("/api/skins")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.equippedSkinId) setEquippedSkinId(d.equippedSkinId); })
      .catch(() => { /* ignore */ });
  }, []);

  const skin = SKIN_DEFS[equippedSkinId] ?? SKIN_DEFS.classic;

  const isViewerWhite = match.white_user_id === viewerId;
  const isViewerBlack = match.black_user_id === viewerId;
  const isPlayer = isViewerWhite || isViewerBlack;
  const myColor: "w" | "b" | null = isViewerWhite ? "w" : isViewerBlack ? "b" : null;
  const orientation: "white" | "black" = isViewerBlack ? "black" : "white";
  const isBotMatch =
    match.status !== "WAITING" &&
    (match.white_user === null || match.black_user === null);

  const chess = useMemo(() => {
    const c = new Chess();
    try {
      if (match.pgn) c.loadPgn(match.pgn);
      else c.load(match.fen);
    } catch { c.load(match.fen); }
    return c;
  }, [match.fen, match.pgn]);

  // Clear selection on move count change
  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoveStyles({});
  }, [match.move_count]);

  // Check achievements once when match finishes
  useEffect(() => {
    if (match.status !== "FINISHED" || !isPlayer || achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    fetch("/api/achievements/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: match.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.newly_earned?.length > 0) {
          setAchievements(data.newly_earned);
        }
      })
      .catch(() => { /* ignore */ });
  }, [match.status, match.id, isPlayer]);

  // Roll for a skin drop once when match finishes (human matches only)
  useEffect(() => {
    if (match.status !== "FINISHED" || !isPlayer || isBotMatch || dropCheckedRef.current) return;
    dropCheckedRef.current = true;
    fetch("/api/skins/drop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: match.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.dropped) {
          setSkinDrop({ skin_id: data.skin_id, skin_name: data.skin_name, rarity: data.rarity });
        }
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.status, match.id, isPlayer]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `refresh` intentionally has a stable identity (no `busy` dependency) so the
  // polling interval below never has to be torn down and recreated mid-game —
  // that churn was a source of board jank. Live values are read via busyRef.
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/matches/${match.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const newMatch: MatchData = data.match;

    setMatch((prev) => {
      if (newMatch.move_count === prev.move_count && newMatch.status === prev.status) return prev;
      return newMatch;
    });

    // Execute pre-move if it's now my turn
    if (
      newMatch.status === "ACTIVE" &&
      newMatch.turn === myColor &&
      premoveRef.current &&
      !busyRef.current
    ) {
      const pm = premoveRef.current;
      premoveRef.current = null;
      setPremoveStyles({});

      const test = new Chess(newMatch.fen);
      if (newMatch.pgn) { try { test.loadPgn(newMatch.pgn); } catch { /* ignore */ } }
      try {
        const valid = test.move({ from: pm.from, to: pm.to, promotion: "q" });
        if (valid) {
          setBusy(true);
          setSendingMove(true);
          fetch(`/api/matches/${newMatch.id}/move`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ from: pm.from, to: pm.to, promotion: "q" }),
          })
            .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
              setBusy(false);
              setSendingMove(false);
              if (!ok) setError(d.error ?? "Pré-lance inválido");
              else setMatch(d.match);
            })
            .catch(() => { setBusy(false); setSendingMove(false); });
        }
      } catch { /* premove became invalid */ }
    }
  }, [match.id, myColor]);

  useEffect(() => {
    if (match.status === "FINISHED" || match.status === "CANCELLED") return;
    pollRef.current = setInterval(refresh, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [match.status, refresh]);

  // Highlight: last move
  const lastMoveStyles = useMemo(() => {
    const moves = chess.history({ verbose: true });
    const last = moves[moves.length - 1];
    if (!last) return {};
    return {
      [last.from]: { backgroundColor: "rgba(245,179,1,0.18)" },
      [last.to]: { backgroundColor: "rgba(245,179,1,0.30)" },
    };
  }, [chess]);

  // Highlight: check
  const checkStyles = useMemo(() => {
    if (!chess.inCheck?.()) return {};
    const board = chess.board();
    const files = "abcdefgh";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p?.type === "k" && p.color === chess.turn()) {
          return { [`${files[c]}${8 - r}`]: { backgroundColor: "rgba(225,82,82,0.55)" } };
        }
      }
    }
    return {};
  }, [chess]);

  const customSquareStyles = useMemo(
    () => ({ ...lastMoveStyles, ...checkStyles, ...premoveStyles, ...legalMoveStyles }),
    [lastMoveStyles, checkStyles, premoveStyles, legalMoveStyles]
  );

  const { capturedByWhite, capturedByBlack, advantage } = useMemo(
    () => calcMaterial(chess),
    [chess]
  );

  const isMyTurn = isPlayer && match.status === "ACTIVE" && match.turn === myColor;

  // Select a piece and show legal moves
  function selectSquare(sq: string) {
    const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
    if (!piece || piece.color !== myColor) return;
    const moves = chess.moves({ square: sq as Parameters<typeof chess.moves>[0]["square"], verbose: true });
    const styles: Record<string, React.CSSProperties> = {
      [sq]: { backgroundColor: "rgba(245,179,1,0.55)" },
    };
    (moves as Array<{ to: string }>).forEach((m) => {
      const hasPiece = chess.get(m.to as Parameters<typeof chess.get>[0]);
      styles[m.to] = hasPiece
        ? { backgroundColor: "rgba(245,179,1,0.30)", borderRadius: "0" }
        : { background: "radial-gradient(circle, rgba(245,179,1,0.45) 24%, transparent 25%)" };
    });
    setSelectedSquare(sq);
    setLegalMoveStyles(styles);
  }

  // Set a pre-move (opponent's turn)
  function setPremove(from: string, to: string) {
    premoveRef.current = { from, to };
    setPremoveStyles({
      [from]: { backgroundColor: "rgba(120,80,220,0.45)" },
      [to]: { backgroundColor: "rgba(120,80,220,0.30)" },
    });
  }

  function clearPremove() {
    premoveRef.current = null;
    setPremoveStyles({});
  }

  function onSquareClick(sq: string) {
    // Opponent's turn: handle pre-move
    if (!isMyTurn && match.status === "ACTIVE" && isPlayer) {
      if (premoveRef.current) {
        // Second click: set destination if first click was on own piece
        const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
        const from = premoveRef.current.from;
        // If clicking from scratch (no from set yet), or re-clicking the same square
        if (from && sq !== from) {
          setPremove(from, sq);
        } else {
          clearPremove();
        }
        return;
      }
      // First click: select own piece for pre-move
      const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
      if (piece && piece.color === myColor) {
        premoveRef.current = { from: sq, to: sq }; // placeholder from
        setPremoveStyles({ [sq]: { backgroundColor: "rgba(120,80,220,0.45)" } });
      }
      return;
    }

    if (!isMyTurn) return;

    if (selectedSquare === null) {
      selectSquare(sq);
      return;
    }
    if (sq === selectedSquare) {
      setSelectedSquare(null);
      setLegalMoveStyles({});
      return;
    }

    const validMove = (
      chess.moves({ square: selectedSquare as Parameters<typeof chess.moves>[0]["square"], verbose: true }) as Array<{ to: string }>
    ).some((m) => m.to === sq);

    if (validMove) {
      const from = selectedSquare;
      setSelectedSquare(null);
      setLegalMoveStyles({});
      onDrop(from, sq);
      return;
    }

    const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
    if (piece && piece.color === myColor) {
      selectSquare(sq);
    } else {
      setSelectedSquare(null);
      setLegalMoveStyles({});
    }
  }

  function onSquareRightClick() {
    // Right-click cancels pre-move
    clearPremove();
  }

  function onDrop(source: string, target: string): boolean {
    setSelectedSquare(null);
    setLegalMoveStyles({});
    if (match.status !== "ACTIVE") return false;
    if (!myColor || match.turn !== myColor) return false;

    const test = new Chess(match.fen);
    if (match.pgn) { try { test.loadPgn(match.pgn); } catch { /* ignore */ } }
    let local;
    try { local = test.move({ from: source, to: target, promotion: "q" }); } catch { return false; }
    if (!local) return false;

    setBusy(true);
    setSendingMove(true);
    setError(null);
    void (async () => {
      const res = await fetch(`/api/matches/${match.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: source, to: target, promotion: "q" }),
      });
      const data = await res.json();
      setBusy(false);
      setSendingMove(false);
      if (!res.ok) { setError(data.error ?? "Erro no lance"); await refresh(); return; }
      setMatch(data.match);
    })();
    return true;
  }

  async function resign() {
    if (!confirm("Tem certeza que deseja desistir?")) return;
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/resign`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    setMatch(data.match);
  }

  async function cancel() {
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/cancel`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await refresh();
  }

  async function joinMatch() {
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/join`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await refresh();
  }

  async function sendReport() {
    setReportError(null);
    const res = await fetch(`/api/matches/${match.id}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reportReason, details: reportDetails }),
    });
    const data = await res.json();
    if (!res.ok) { setReportError(data.error ?? "Erro ao enviar denúncia"); return; }
    setReportSent(true);
    setReportOpen(false);
  }

  async function copyText(text: string, type: "fen" | "pgn") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }

  const topColor: "w" | "b" = orientation === "white" ? "b" : "w";
  const bottomColor: "w" | "b" = orientation === "white" ? "w" : "b";
  const topUser = topColor === "w" ? match.white_user : match.black_user;
  const bottomUser = bottomColor === "w" ? match.white_user : match.black_user;
  const topCaptured = topColor === "w" ? capturedByWhite : capturedByBlack;
  const bottomCaptured = bottomColor === "w" ? capturedByWhite : capturedByBlack;
  const topAdvantage = topColor === "w" ? Math.max(0, advantage) : Math.max(0, -advantage);
  const bottomAdvantage = bottomColor === "w" ? Math.max(0, advantage) : Math.max(0, -advantage);
  const topIsTurn = match.status === "ACTIVE" && match.turn === topColor;
  const bottomIsTurn = match.status === "ACTIVE" && match.turn === bottomColor;
  const topIsMe = myColor === topColor;
  const bottomIsMe = myColor === bottomColor;
  const hasPremove = !!premoveRef.current && premoveRef.current.from !== premoveRef.current.to;

  const topPlaceholder =
    topUser === null
      ? match.status === "WAITING"
        ? "Aguardando oponente…"
        : isBotMatch
          ? "🤖 Bot"
          : "Sem oponente"
      : "";
  const bottomPlaceholder = bottomIsMe
    ? `@${bottomUser?.username ?? "Você"}`
    : "Espectador";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Denunciar oponente</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Motivo</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="input w-full"
                >
                  <option value="cheating">Uso de engine/bot</option>
                  <option value="stalling">Jogo lento intencional</option>
                  <option value="abuse">Comportamento abusivo</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div>
                <label className="label">Detalhes (opcional)</label>
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder="Descreva o comportamento suspeito…"
                />
              </div>
              {reportError && <p className="text-xs text-danger">{reportError}</p>}
              <div className="flex gap-2">
                <button onClick={sendReport} className="btn-danger flex-1">Enviar</button>
                <button onClick={() => setReportOpen(false)} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Achievement toasts */}
      {achievements.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-glow"
            >
              <span className="text-2xl">{a.icon}</span>
              <div>
                <div className="text-xs font-bold text-accent">Nova conquista!</div>
                <div className="text-sm font-semibold">{a.name}</div>
                {a.reward_coins > 0 && (
                  <div className="text-xs text-success">+{a.reward_coins} coins</div>
                )}
              </div>
              <button
                onClick={() => setAchievements((prev) => prev.filter((x) => x.id !== a.id))}
                className="ml-2 text-muted hover:text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Skin drop toast */}
      {skinDrop && (
        <div className="fixed bottom-4 left-4 z-50">
          <div
            className="flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 shadow-glow"
            style={{ borderColor: RARITY_COLORS[skinDrop.rarity] + "66" }}
          >
            <span className="text-2xl">🎁</span>
            <div>
              <div className="text-xs font-bold" style={{ color: RARITY_COLORS[skinDrop.rarity] }}>
                Drop de skin! ({RARITY_LABELS[skinDrop.rarity]})
              </div>
              <div className="text-sm font-semibold">{skinDrop.skin_name}</div>
              <Link href="/inventory" className="text-xs text-accent hover:underline">
                Ver inventário
              </Link>
            </div>
            <button onClick={() => setSkinDrop(null)} className="ml-2 text-muted hover:text-white">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Board column */}
      <div className="space-y-2">
        <div className="flex items-center justify-between py-1">
          <h1 className="text-sm font-medium text-muted">
            Partida <span className="font-mono text-white">#{match.id.slice(-6)}</span>
            {isBotMatch && (
              <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                vs Bot
              </span>
            )}
          </h1>
          <Link href="/lobby" className="text-sm text-muted transition-colors hover:text-white">
            ← Lobby
          </Link>
        </div>

        <PlayerBar
          user={topUser}
          color={topColor}
          isTurn={topIsTurn}
          placeholder={topPlaceholder}
          captured={topCaptured}
          advantage={topAdvantage}
          isMe={topIsMe}
        />

        <div className="relative">
          <Chessboard
            position={match.fen}
            boardOrientation={orientation}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            onSquareRightClick={onSquareRightClick}
            arePiecesDraggable={(isMyTurn || (!isMyTurn && isPlayer && match.status === "ACTIVE")) && !busy}
            customSquareStyles={customSquareStyles}
            showBoardNotation={true}
            customBoardStyle={{
              borderRadius: "8px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
            }}
            customDarkSquareStyle={{ backgroundColor: skin.boardDark }}
            customLightSquareStyle={{ backgroundColor: skin.boardLight }}
          />
          {/* Only show the overlay spinner while sending our own move — never
              while merely waiting on the bot, which felt bad in testing. */}
          {sendingMove && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}
        </div>

        {isBotMatch && busy && !sendingMove && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Bot está pensando…
          </div>
        )}

        <PlayerBar
          user={bottomUser}
          color={bottomColor}
          isTurn={bottomIsTurn}
          placeholder={bottomPlaceholder}
          captured={bottomCaptured}
          advantage={bottomAdvantage}
          isMe={bottomIsMe}
        />

        {/* Pre-move indicator */}
        {hasPremove && (
          <div className="flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs">
            <span className="text-purple-300">Pré-lance ativo</span>
            <button onClick={clearPremove} className="text-muted hover:text-white">
              Cancelar
            </button>
          </div>
        )}

        {error && (
          <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="space-y-3">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Status</h3>
            <StatusBadge status={match.status} result={match.result} />
          </div>
          <div className="text-sm">
            {match.status === "WAITING" && (
              <p className="text-muted">
                {match.creator_id === viewerId
                  ? "Aguardando oponente entrar…"
                  : "Você pode entrar nesta partida."}
              </p>
            )}
            {match.status === "ACTIVE" && (
              <p className={isMyTurn ? "font-medium text-accent" : "text-muted"}>
                {isPlayer
                  ? isMyTurn
                    ? "Sua vez de jogar."
                    : "Aguardando o oponente…"
                  : "Partida em andamento."}
              </p>
            )}
            {match.status === "FINISHED" && (
              <div className="space-y-1">
                <p className="font-medium">{resultLabel(match.result)}</p>
                {match.payout > 0 && (
                  <p className="text-xs text-muted">
                    Prêmio:{" "}
                    <span className="font-semibold text-success">
                      {formatCoins(match.payout)} coins
                    </span>{" "}
                    → @{match.winner?.username}
                  </p>
                )}
              </div>
            )}
            {match.status === "CANCELLED" && <p className="text-muted">Partida cancelada.</p>}
          </div>
          <div className="flex flex-col gap-2">
            {match.status === "WAITING" && !isPlayer && (
              <button onClick={joinMatch} disabled={busy} className="btn-primary">
                Entrar ({formatCoins(match.wager)} coins)
              </button>
            )}
            {match.status === "WAITING" && match.creator_id === viewerId && (
              <button onClick={cancel} disabled={busy} className="btn-danger">Cancelar partida</button>
            )}
            {match.status === "ACTIVE" && isPlayer && (
              <button onClick={resign} disabled={busy} className="btn-danger">Desistir</button>
            )}
            {match.status === "FINISHED" && (
              <>
                <Link href="/lobby" className="btn-primary text-center">Voltar ao lobby</Link>
                <Link href="/achievements" className="btn-secondary text-center text-xs">
                  Ver conquistas
                </Link>
                {isPlayer && !isBotMatch && (
                  reportSent ? (
                    <div className="rounded border border-success/30 px-3 py-2 text-center text-xs text-success">
                      Denúncia enviada ✓
                    </div>
                  ) : (
                    <button
                      onClick={() => setReportOpen(true)}
                      className="rounded border border-danger/30 px-3 py-2 text-xs text-danger transition-colors hover:border-danger/60 hover:bg-danger/10"
                    >
                      Denunciar oponente
                    </button>
                  )
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Pote</span>
            <span className="badge text-[10px]">{Math.round(match.rake_bps / 100)}% rake</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-accent">{formatCoins(match.pot)}</span>
            <span className="text-sm text-muted">coins</span>
          </div>
          {match.wager > 0 ? (
            <div className="mt-1 text-xs text-muted">
              Aposta por jogador: <span className="text-white">{formatCoins(match.wager)}</span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">Amistoso sem aposta</div>
          )}
        </div>

        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Lances <span className="text-white">({match.move_count})</span>
            </h3>
            <div className="flex gap-1">
              <button
                onClick={() => copyText(match.fen, "fen")}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                {copied === "fen" ? "✓ FEN" : "FEN"}
              </button>
              <button
                onClick={() => copyText(match.pgn || "", "pgn")}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                {copied === "pgn" ? "✓ PGN" : "PGN"}
              </button>
            </div>
          </div>
          <div className="scrollbar-thin max-h-52 overflow-y-auto">
            <PgnList pgn={match.pgn} moveCount={match.move_count} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function PlayerBar({
  user, color, isTurn, placeholder, captured, advantage, isMe,
}: {
  user: { username: string; rating: number; games_played?: number } | null;
  color: "w" | "b";
  isTurn: boolean;
  placeholder: string;
  captured: string[];
  advantage: number;
  isMe?: boolean;
}) {
  const sortedCaptures = [...captured].sort(
    (a, b) => PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b)
  );
  const isProvisional = user && (user.games_played ?? 10) < 10;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all duration-200 ${
      isTurn ? "border-accent/50 bg-accent/5 ring-1 ring-accent/20" : "border-border bg-surfaceAlt"
    }`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base select-none ${
        color === "w" ? "border-white/25 bg-white/10 text-white" : "border-white/10 bg-black/25 text-white"
      }`}>
        {color === "w" ? "♔" : "♚"}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              <span className="truncate text-sm font-semibold">{isMe ? "Você" : `@${user.username}`}</span>
              <span className="shrink-0 text-xs text-muted">
                ({user.rating}{isProvisional && <span className="text-accent">?</span>})
              </span>
              {advantage > 0 && <span className="shrink-0 text-xs font-medium text-success">+{advantage}</span>}
            </>
          ) : (
            <span className="text-sm text-muted">{placeholder}</span>
          )}
        </div>
        {sortedCaptures.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-0 text-[11px] leading-none opacity-60 select-none">
            {sortedCaptures.map((p, i) => <span key={i}>{CAPTURED_SYMBOLS[p]}</span>)}
          </div>
        )}
      </div>
      {isTurn && (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="hidden text-xs text-accent sm:block">jogando</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, result }: { status: string; result: string | null }) {
  if (status === "WAITING") return <span className="badge text-[10px]">Aguardando</span>;
  if (status === "ACTIVE") return <span className="badge-accent text-[10px]">Em andamento</span>;
  if (status === "FINISHED") {
    if (result?.includes("DRAW")) return <span className="badge text-[10px]">Empate</span>;
    return <span className="badge-success text-[10px]">Finalizada</span>;
  }
  if (status === "CANCELLED") return <span className="badge-danger text-[10px]">Cancelada</span>;
  return null;
}

function PgnList({ pgn, moveCount }: { pgn: string; moveCount: number }) {
  const listRef = useRef<HTMLOListElement>(null);

  const pairs = useMemo(() => {
    if (!pgn) return [];
    const tokens = pgn
      .replace(/\{[^}]*\}/g, "")
      .replace(/\([^)]*\)/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !/^(\[|1-0|0-1|1\/2-1\/2|\*$)/.test(t));
    const result: { num: number; w?: string; b?: string }[] = [];
    for (const t of tokens) {
      const m = t.match(/^(\d+)\.+$/);
      if (m) result.push({ num: Number(m[1]) });
      else if (result.length) {
        const last = result[result.length - 1];
        if (!last.w) last.w = t;
        else if (!last.b) last.b = t;
      }
    }
    return result;
  }, [pgn]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [moveCount]);

  if (!pgn || pairs.length === 0)
    return <p className="text-xs text-muted">Sem lances ainda.</p>;

  const lastIdx = pairs.length - 1;

  return (
    <ol ref={listRef} className="space-y-0.5 font-mono text-xs">
      {pairs.map((p, i) => {
        const isLast = i === lastIdx;
        return (
          <li key={p.num} className={`flex gap-2 rounded px-1 py-0.5 ${isLast ? "bg-accent/10" : "hover:bg-surfaceAlt"}`}>
            <span className="w-5 shrink-0 text-muted">{p.num}.</span>
            <span className={`w-14 shrink-0 ${isLast && moveCount % 2 === 1 ? "font-bold text-accent" : ""}`}>{p.w}</span>
            <span className={`w-14 shrink-0 ${isLast && moveCount % 2 === 0 && p.b ? "font-bold text-accent" : ""}`}>{p.b}</span>
          </li>
        );
      })}
    </ol>
  );
}

function resultLabel(result: string | null): string {
  switch (result) {
    case "WHITE_WIN": return "Brancas venceram (xeque-mate)";
    case "BLACK_WIN": return "Pretas venceram (xeque-mate)";
    case "WHITE_RESIGN": return "Brancas desistiram";
    case "BLACK_RESIGN": return "Pretas desistiram";
    case "DRAW": return "Empate";
    case "WHITE_TIMEOUT": return "Brancas perderam por tempo";
    case "BLACK_TIMEOUT": return "Pretas perderam por tempo";
    default: return "Encerrada";
  }
}
