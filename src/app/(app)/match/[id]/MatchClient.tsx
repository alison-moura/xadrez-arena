"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCoins } from "@/lib/utils";
import { SKIN_DEFS, RARITY_COLORS, RARITY_LABELS, type SkinRarity } from "@/lib/skins";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { play as playSound, isMuted, setMuted } from "@/lib/sounds";
import { detectOpening } from "@/lib/openings";
import { UserPopover } from "@/components/UserPopover";

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
  time_control_seconds: number | null;
  time_increment_seconds: number;
  white_time_ms: number | null;
  black_time_ms: number | null;
  last_move_at: string | null;
  draw_offered_by: string | null;
  rematch_offered_by: string | null;
  rematch_match_id: string | null;
};

type EarnedAchievement = { id: string; name: string; icon: string; reward_coins: number };
type SkinDrop = { skin_id: string; skin_name: string; rarity: SkinRarity };

type ChatMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { id: string; username: string } | null;
};

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_ORDER = ["q", "r", "b", "n", "p"];
const CAPTURED_SYMBOLS: Record<string, string> = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

// Cores cíclicas para anotação (right-click) — estilo Lichess
const ANNOTATION_COLORS = ["rgba(80,200,120,0.55)", "rgba(225,82,82,0.55)", "rgba(96,165,255,0.55)"] as const;

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

function formatClock(ms: number | null): string {
  if (ms === null || ms === undefined) return "∞";
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (m < 1) {
    const tenths = Math.floor((safe % 1000) / 100);
    return `0:${String(s).padStart(2, "0")}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Classifica o tipo de lance (para som)
function classifyMove(prev: Chess, next: Chess): "move" | "capture" | "check" | "castle" | "promote" {
  const history = next.history({ verbose: true });
  const last = history[history.length - 1];
  if (!last) return "move";
  if (next.inCheck?.()) return "check";
  if (last.flags?.includes("p")) return "promote";
  if (last.flags?.includes("k") || last.flags?.includes("q")) return "castle";
  if (last.flags?.includes("c") || last.flags?.includes("e")) return "capture";
  return "move";
}

export function MatchClient({
  initialMatch,
  viewerId,
}: {
  initialMatch: MatchData;
  viewerId: string;
}) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchData>(initialMatch);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingMove, setSendingMove] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveStyles, setLegalMoveStyles] = useState<Record<string, React.CSSProperties>>({});
  const [premoveStyles, setPremoveStyles] = useState<Record<string, React.CSSProperties>>({});
  const [annotationStyles, setAnnotationStyles] = useState<Record<string, React.CSSProperties>>({});
  const [copied, setCopied] = useState<"fen" | "pgn" | "url" | null>(null);
  const [achievements, setAchievements] = useState<EarnedAchievement[]>([]);
  const [skinDrop, setSkinDrop] = useState<SkinDrop | null>(null);
  const [equippedSkinId, setEquippedSkinId] = useState("classic");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>("cheating");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [muteOn, setMuteOnState] = useState<boolean>(false);
  const [orientationOverride, setOrientationOverride] = useState<"white" | "black" | null>(null);
  const [endShown, setEndShown] = useState(false);
  const [endVisible, setEndVisible] = useState(false);
  const [incrementBump, setIncrementBump] = useState<{ color: "w" | "b"; amount: number; key: number } | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);

  const [pgnIndex, setPgnIndex] = useState<number | null>(null);

  const chatListRef = useRef<HTMLDivElement>(null);
  const premoveRef = useRef<{ from: string; to: string }[]>([]);
  const premovePendingFromRef = useRef<string | null>(null);
  const PREMOVE_QUEUE_LIMIT = 3;
  const achievementCheckedRef = useRef(false);
  const dropCheckedRef = useRef(false);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const flaggedRef = useRef(false);
  const lastMoveCountForSoundRef = useRef(initialMatch.move_count);
  const lastIncrementRef = useRef<{ w: number | null; b: number | null }>({ w: initialMatch.white_time_ms, b: initialMatch.black_time_ms });
  const lowTimeBeepRef = useRef<number>(0);
  const matchStartSoundRef = useRef(false);

  useEffect(() => { setMuteOnState(isMuted()); }, []);

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
  const baseOrientation: "white" | "black" = isViewerBlack ? "black" : "white";
  const orientation: "white" | "black" = orientationOverride ?? baseOrientation;
  const isBotMatch =
    match.status !== "WAITING" &&
    (match.white_user === null || match.black_user === null);
  const hasClock = match.time_control_seconds !== null && match.time_control_seconds !== undefined;

  const fullChess = useMemo(() => {
    const c = new Chess();
    try {
      if (match.pgn) c.loadPgn(match.pgn);
      else c.load(match.fen);
    } catch { c.load(match.fen); }
    return c;
  }, [match.fen, match.pgn]);

  const fullHistory = useMemo(() => fullChess.history({ verbose: true }), [fullChess]);
  const sanHistory  = useMemo(() => fullChess.history(), [fullChess]);

  const isLiveView = pgnIndex === null || pgnIndex === fullHistory.length;
  const displayChess = useMemo(() => {
    if (isLiveView) return fullChess;
    const c = new Chess();
    for (let i = 0; i < Math.max(0, pgnIndex ?? 0); i++) {
      const mv = fullHistory[i];
      if (!mv) break;
      c.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    }
    return c;
  }, [isLiveView, pgnIndex, fullChess, fullHistory]);

  const displayFen = displayChess.fen();

  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoveStyles({});
    setPromotionPending(null);
  }, [match.move_count]);

  useEffect(() => {
    if (isPlayer) setPgnIndex(null);
  }, [match.move_count, isPlayer]);

  // Achievements check
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
        if (data.newly_earned?.length > 0) setAchievements(data.newly_earned);
      })
      .catch(() => { /* ignore */ });
  }, [match.status, match.id, isPlayer]);

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
        if (data?.dropped) setSkinDrop({ skin_id: data.skin_id, skin_name: data.skin_name, rarity: data.rarity });
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.status, match.id, isPlayer]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/matches/${match.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const newMatch: MatchData = data.match;

    setMatch((prev) => {
      if (
        newMatch.move_count === prev.move_count &&
        newMatch.status === prev.status &&
        newMatch.draw_offered_by === prev.draw_offered_by &&
        newMatch.rematch_offered_by === prev.rematch_offered_by &&
        newMatch.rematch_match_id === prev.rematch_match_id &&
        newMatch.white_time_ms === prev.white_time_ms &&
        newMatch.black_time_ms === prev.black_time_ms
      ) return prev;
      return newMatch;
    });

    if (
      newMatch.status === "ACTIVE" &&
      newMatch.turn === myColor &&
      premoveRef.current.length > 0 &&
      !busyRef.current
    ) {
      const pm = premoveRef.current[0];
      premoveRef.current = premoveRef.current.slice(1);
      renderPremoveStyles();

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
              if (!ok) {
                setError(d.error ?? "Pré-lance inválido");
                premoveRef.current = []; // descarta fila inteira em erro
                renderPremoveStyles();
              } else if (d?.match) setMatch(d.match);
            })
            .catch(() => { setBusy(false); setSendingMove(false); });
        } else {
          // primeiro inválido → descarta tudo
          premoveRef.current = [];
          renderPremoveStyles();
        }
      } catch {
        premoveRef.current = [];
        renderPremoveStyles();
      }
    }
  }, [match.id, myColor]);

  // Polling + Realtime (mantém realtime se disponível; polling como fallback)
  useEffect(() => {
    if (match.status === "FINISHED" || match.status === "CANCELLED") return;

    const sb = getSupabaseBrowser();
    let realtimeUp = false;
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;

    if (sb) {
      channel = sb
        .channel(`match:${match.id}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "chess_matches", filter: `id=eq.${match.id}` },
          () => { realtimeUp = true; refresh(); }
        )
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "chess_moves", filter: `match_id=eq.${match.id}` },
          () => { realtimeUp = true; refresh(); }
        )
        .subscribe();
    }
    pollRef.current = setInterval(() => { if (!realtimeUp) refresh(); }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (channel && sb) sb.removeChannel(channel);
    };
  }, [match.status, match.id, refresh]);

  // Tick local do relógio
  useEffect(() => {
    if (!hasClock || match.status !== "ACTIVE") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [hasClock, match.status]);

  const liveTimes = useMemo(() => {
    if (!hasClock) return { w: null as number | null, b: null as number | null };
    const baseW = match.white_time_ms ?? (match.time_control_seconds ?? 0) * 1000;
    const baseB = match.black_time_ms ?? (match.time_control_seconds ?? 0) * 1000;
    if (match.status !== "ACTIVE" || !match.last_move_at) return { w: baseW, b: baseB };
    const elapsed = Math.max(0, now - new Date(match.last_move_at).getTime());
    if (match.turn === "w") return { w: Math.max(0, baseW - elapsed), b: baseB };
    return { w: baseW, b: Math.max(0, baseB - elapsed) };
  }, [hasClock, match.white_time_ms, match.black_time_ms, match.time_control_seconds,
      match.status, match.last_move_at, match.turn, now]);

  // Auto-flag por tempo
  useEffect(() => {
    if (!hasClock || match.status !== "ACTIVE" || flaggedRef.current) return;
    const remaining = match.turn === "w" ? liveTimes.w : liveTimes.b;
    if (remaining !== null && remaining <= 0) {
      flaggedRef.current = true;
      fetch(`/api/matches/${match.id}/flag-time`, { method: "POST" })
        .then(() => refresh())
        .catch(() => { flaggedRef.current = false; });
    }
  }, [hasClock, match.status, match.id, match.turn, liveTimes.w, liveTimes.b, refresh]);

  useEffect(() => { flaggedRef.current = false; }, [match.id]);

  // Som de início (uma vez quando entra em ACTIVE)
  useEffect(() => {
    if (match.status === "ACTIVE" && !matchStartSoundRef.current) {
      matchStartSoundRef.current = true;
      playSound("start");
    }
  }, [match.status]);

  // Som por tipo de lance + animação de incremento
  useEffect(() => {
    if (match.move_count <= lastMoveCountForSoundRef.current) {
      // Reset (rematch / view change)
      lastMoveCountForSoundRef.current = match.move_count;
      lastIncrementRef.current = { w: match.white_time_ms, b: match.black_time_ms };
      return;
    }
    // Decide o tipo de lance pelo último na história
    try {
      const kind = classifyMove(new Chess(), fullChess);
      playSound(kind);
    } catch { /* ignore */ }
    lastMoveCountForSoundRef.current = match.move_count;

    // Detecta incremento aplicado
    if (hasClock && match.time_increment_seconds > 0) {
      // Qual lado acabou de jogar?
      const movedColor: "w" | "b" = match.turn === "w" ? "b" : "w";
      const prev = movedColor === "w" ? lastIncrementRef.current.w : lastIncrementRef.current.b;
      const curr = movedColor === "w" ? match.white_time_ms : match.black_time_ms;
      if (prev != null && curr != null && curr > prev) {
        setIncrementBump({ color: movedColor, amount: match.time_increment_seconds, key: Date.now() });
        setTimeout(() => setIncrementBump(null), 900);
      }
    }
    lastIncrementRef.current = { w: match.white_time_ms, b: match.black_time_ms };
  }, [match.move_count, match.white_time_ms, match.black_time_ms, hasClock, match.time_increment_seconds, match.turn, fullChess]);

  // Beep de tempo curto: tocar a cada segundo quando o nosso relógio entra em <15s
  useEffect(() => {
    if (!hasClock || match.status !== "ACTIVE" || !myColor) return;
    const myMs = myColor === "w" ? liveTimes.w : liveTimes.b;
    if (myMs === null || myMs > 15_000 || match.turn !== myColor) return;
    const sec = Math.floor(myMs / 1000);
    if (sec !== lowTimeBeepRef.current && sec >= 0 && sec <= 10) {
      lowTimeBeepRef.current = sec;
      playSound("lowTime");
    }
  }, [hasClock, match.status, match.turn, myColor, liveTimes.w, liveTimes.b]);

  // Modal de fim de jogo (uma vez)
  useEffect(() => {
    if (match.status === "FINISHED" && !endShown) {
      setEndShown(true);
      setEndVisible(true);
      // Som
      if (isPlayer) {
        const r = match.result ?? "";
        if (r.includes("DRAW")) playSound("draw");
        else if (match.winner?.id === viewerId) playSound("winSelf");
        else playSound("loseSelf");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.status, match.result, endShown]);

  // Som ao receber mensagem nova (apenas se viewer não é o autor)
  const lastMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      const last = messages[messages.length - 1];
      if (last && last.user_id !== viewerId) playSound("notify");
      lastMsgCountRef.current = messages.length;
    }
  }, [messages, viewerId]);

  // Som de oferta de empate recebida
  const drawOfferedByOppRef = useRef<string | null>(null);
  useEffect(() => {
    const offered = match.draw_offered_by;
    if (offered && offered !== viewerId && offered !== drawOfferedByOppRef.current) {
      playSound("notify");
    }
    drawOfferedByOppRef.current = offered;
  }, [match.draw_offered_by, viewerId]);

  // Highlights derivados
  const lastMoveStyles = useMemo(() => {
    const moves = displayChess.history({ verbose: true });
    const last = moves[moves.length - 1];
    if (!last) return {};
    return {
      [last.from]: { backgroundColor: "rgba(245,179,1,0.18)" },
      [last.to]: { backgroundColor: "rgba(245,179,1,0.30)" },
    };
  }, [displayChess]);

  const checkStyles = useMemo(() => {
    if (!displayChess.inCheck?.()) return {};
    const board = displayChess.board();
    const files = "abcdefgh";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p?.type === "k" && p.color === displayChess.turn()) {
          return { [`${files[c]}${8 - r}`]: { backgroundColor: "rgba(225,82,82,0.55)" } };
        }
      }
    }
    return {};
  }, [displayChess]);

  // Setas (último lance) — cast por causa do tipo Square do react-chessboard
  const customArrows = useMemo(() => {
    const moves = displayChess.history({ verbose: true });
    const last = moves[moves.length - 1];
    if (!last) return [] as unknown[] as never[];
    return ([[last.from, last.to, "rgba(245,179,1,0.65)"]] as unknown) as never[];
  }, [displayChess]);

  const customSquareStyles = useMemo(
    () => ({
      ...lastMoveStyles,
      ...checkStyles,
      ...annotationStyles,
      ...premoveStyles,
      ...legalMoveStyles,
    }),
    [lastMoveStyles, checkStyles, annotationStyles, premoveStyles, legalMoveStyles]
  );

  const { capturedByWhite, capturedByBlack, advantage } = useMemo(
    () => calcMaterial(displayChess),
    [displayChess]
  );

  const isMyTurn = isPlayer && match.status === "ACTIVE" && match.turn === myColor && isLiveView;

  // Detecção de claim de empate (chess.js)
  const drawClaimable = useMemo(() => {
    if (match.status !== "ACTIVE" || !isPlayer || !isLiveView) return null as null | string;
    try {
      if (fullChess.isThreefoldRepetition?.()) return "Repetição tripla";
      if (fullChess.isInsufficientMaterial?.()) return "Material insuficiente";
      if (fullChess.isDraw?.()) return "Regra dos 50 lances / posição morta";
    } catch { /* ignore */ }
    return null;
  }, [fullChess, match.status, isPlayer, isLiveView]);

  // Opening name
  const openingName = useMemo(() => {
    if (sanHistory.length === 0 || sanHistory.length > 20) return null;
    return detectOpening(sanHistory);
  }, [sanHistory]);

  function selectSquare(sq: string) {
    const piece = displayChess.get(sq as Parameters<typeof displayChess.get>[0]);
    if (!piece || piece.color !== myColor) return;
    const moves = displayChess.moves({ square: sq as Parameters<typeof displayChess.moves>[0]["square"], verbose: true });
    const styles: Record<string, React.CSSProperties> = {
      [sq]: { backgroundColor: "rgba(245,179,1,0.55)" },
    };
    (moves as Array<{ to: string }>).forEach((m) => {
      const hasPiece = displayChess.get(m.to as Parameters<typeof displayChess.get>[0]);
      styles[m.to] = hasPiece
        ? { backgroundColor: "rgba(245,179,1,0.30)", borderRadius: "0" }
        : { background: "radial-gradient(circle, rgba(245,179,1,0.45) 24%, transparent 25%)" };
    });
    setSelectedSquare(sq);
    setLegalMoveStyles(styles);
  }

  function renderPremoveStyles() {
    const styles: Record<string, React.CSSProperties> = {};
    premoveRef.current.forEach((pm, idx) => {
      // primeira casa mais opaca, encadeadas menos
      const alphaFrom = idx === 0 ? 0.55 : 0.30;
      const alphaTo   = idx === 0 ? 0.40 : 0.20;
      styles[pm.from] = { backgroundColor: `rgba(120,80,220,${alphaFrom})` };
      styles[pm.to]   = { backgroundColor: `rgba(120,80,220,${alphaTo})` };
    });
    setPremoveStyles(styles);
  }

  function enqueuePremove(from: string, to: string) {
    if (premoveRef.current.length >= PREMOVE_QUEUE_LIMIT) return;
    premoveRef.current = [...premoveRef.current, { from, to }];
    renderPremoveStyles();
  }

  function clearPremove() {
    premoveRef.current = [];
    setPremoveStyles({});
  }

  // Simula a posição após executar todos os pré-lances atuais.
  // Usado pra validar o próximo pré-lance encadeado sem precisar do servidor.
  function projectedChess(): Chess {
    const c = new Chess(match.fen);
    if (match.pgn) { try { c.loadPgn(match.pgn); } catch { /* ignore */ } }
    for (const pm of premoveRef.current) {
      try { c.move({ from: pm.from, to: pm.to, promotion: "q" }); } catch { /* ignore */ }
    }
    return c;
  }

  // Cycle de anotação numa casa
  function cycleAnnotation(sq: string) {
    setAnnotationStyles((prev) => {
      const cur = prev[sq]?.backgroundColor as string | undefined;
      const idx = cur ? ANNOTATION_COLORS.indexOf(cur as typeof ANNOTATION_COLORS[number]) : -1;
      const next = ANNOTATION_COLORS[(idx + 1) % ANNOTATION_COLORS.length];
      // Se já estava na última cor, limpa
      if (idx === ANNOTATION_COLORS.length - 1) {
        const copy = { ...prev };
        delete copy[sq];
        return copy;
      }
      return { ...prev, [sq]: { backgroundColor: next } };
    });
  }

  function onSquareClick(sq: string) {
    if (!isLiveView) return;

    if (!isMyTurn && match.status === "ACTIVE" && isPlayer) {
      // Fluxo de pré-lance com fila: clica peça (cor projetada) → clica destino
      const proj = projectedChess();
      // Estamos no meio de selecionar origem? Usamos premovePendingFromRef
      const pendingFrom = premovePendingFromRef.current;
      if (pendingFrom) {
        if (sq === pendingFrom) { premovePendingFromRef.current = null; renderPremoveStyles(); return; }
        // Tenta validar o pré-lance projetado
        try {
          const test = new Chess(proj.fen());
          const ok = test.move({ from: pendingFrom, to: sq, promotion: "q" });
          if (ok) {
            premovePendingFromRef.current = null;
            enqueuePremove(pendingFrom, sq);
          } else {
            // lance inválido, ignora
            premovePendingFromRef.current = null;
            renderPremoveStyles();
          }
        } catch {
          premovePendingFromRef.current = null;
          renderPremoveStyles();
        }
        return;
      }
      // Primeira clique: tem que ser uma peça nossa NA POSIÇÃO PROJETADA
      const piece = proj.get(sq as Parameters<typeof proj.get>[0]);
      if (piece && piece.color === myColor) {
        premovePendingFromRef.current = sq;
        renderPremoveStyles();
        setPremoveStyles((prev) => ({ ...prev, [sq]: { backgroundColor: "rgba(120,80,220,0.55)" } }));
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
      displayChess.moves({ square: selectedSquare as Parameters<typeof displayChess.moves>[0]["square"], verbose: true }) as Array<{ to: string; promotion?: string }>
    ).some((m) => m.to === sq);

    if (validMove) {
      const from = selectedSquare;
      setSelectedSquare(null);
      setLegalMoveStyles({});
      onDrop(from, sq);
      return;
    }

    const piece = displayChess.get(sq as Parameters<typeof displayChess.get>[0]);
    if (piece && piece.color === myColor) selectSquare(sq);
    else {
      setSelectedSquare(null);
      setLegalMoveStyles({});
    }
  }

  function onSquareRightClick(sq: string) {
    // Se há premove, cancela primeiro
    if (premoveRef.current) {
      clearPremove();
      return;
    }
    cycleAnnotation(sq);
  }

  function isPromotionMove(from: string, to: string): boolean {
    const piece = displayChess.get(from as Parameters<typeof displayChess.get>[0]);
    if (!piece || piece.type !== "p") return false;
    const lastRank = piece.color === "w" ? "8" : "1";
    return to.endsWith(lastRank);
  }

  function onDrop(source: string, target: string): boolean {
    setSelectedSquare(null);
    setLegalMoveStyles({});
    if (!isLiveView) return false;
    if (match.status !== "ACTIVE") return false;
    if (!myColor || match.turn !== myColor) return false;

    if (isPromotionMove(source, target)) {
      const test = new Chess(match.fen);
      if (match.pgn) { try { test.loadPgn(match.pgn); } catch { /* ignore */ } }
      try {
        const ok = test.move({ from: source, to: target, promotion: "q" });
        if (!ok) return false;
      } catch { return false; }
      setPromotionPending({ from: source, to: target });
      return true;
    }

    return submitMove(source, target, "q");
  }

  function submitMove(source: string, target: string, promotion: string): boolean {
    const test = new Chess(match.fen);
    if (match.pgn) { try { test.loadPgn(match.pgn); } catch { /* ignore */ } }
    try { if (!test.move({ from: source, to: target, promotion: promotion as "q" })) return false; } catch { return false; }

    setBusy(true);
    setSendingMove(true);
    setError(null);
    void (async () => {
      const res = await fetch(`/api/matches/${match.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: source, to: target, promotion }),
      });
      const data = await res.json();
      setBusy(false);
      setSendingMove(false);
      if (!res.ok) { setError(data.error ?? "Erro no lance"); await refresh(); return; }
      if (data?.match) setMatch(data.match);
      if (data?.flagged) setError("Tempo esgotou durante o lance.");
    })();
    return true;
  }

  function confirmPromotion(piece: "q" | "r" | "b" | "n") {
    if (!promotionPending) return;
    const { from, to } = promotionPending;
    setPromotionPending(null);
    submitMove(from, to, piece);
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

  async function drawAction(action: "offer" | "accept" | "decline") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}/draw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await refresh();
  }

  async function claimDraw() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}/claim-draw`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    await refresh();
  }

  async function requestRematch() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}/rematch`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Erro"); return; }
    const result = data.result ?? data;
    const newId = result?.match_id;
    const auto = result?.auto_started;
    if (auto && newId) {
      router.push(`/match/${newId}`);
    } else {
      await refresh();
    }
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

  async function copyText(text: string, type: "fen" | "pgn" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }

  // Chat
  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/matches/${match.id}/chat`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, [match.id]);

  useEffect(() => {
    if (!isPlayer && match.status === "WAITING") return;
    loadMessages();
    const sb = getSupabaseBrowser();
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    if (sb) {
      channel = sb
        .channel(`messages:${match.id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "chess_match_messages", filter: `match_id=eq.${match.id}` },
          () => loadMessages()
        )
        .subscribe();
    } else {
      pollId = setInterval(loadMessages, 4000);
    }
    return () => {
      if (channel && sb) sb.removeChannel(channel);
      if (pollId) clearInterval(pollId);
    };
  }, [match.id, isPlayer, match.status, loadMessages]);

  useEffect(() => {
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [messages.length]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const content = chatDraft.trim();
    if (!content) return;
    setChatError(null);
    setChatDraft("");
    const res = await fetch(`/api/matches/${match.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setChatError(data.error ?? "Erro ao enviar");
      setChatDraft(content);
      return;
    }
    await loadMessages();
  }

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const total = fullHistory.length;
      const cur = isLiveView ? total : (pgnIndex ?? 0);
      if (e.key === "ArrowLeft")        { e.preventDefault(); if (cur > 0) setPgnIndex(cur - 1); }
      else if (e.key === "ArrowRight")  { e.preventDefault(); if (cur < total) setPgnIndex(cur + 1 === total ? null : cur + 1); }
      else if (e.key === "ArrowUp" || e.key === "Home")
                                        { e.preventDefault(); setPgnIndex(0); }
      else if (e.key === "ArrowDown" || e.key === "End")
                                        { e.preventDefault(); setPgnIndex(null); }
      else if (e.key === "f" || e.key === "F")
                                        { e.preventDefault(); setOrientationOverride((v) => v ? null : (baseOrientation === "white" ? "black" : "white")); }
      else if (e.key === "m" || e.key === "M") {
                                          e.preventDefault();
                                          const nv = !muteOn;
                                          setMuted(nv);
                                          setMuteOnState(nv);
                                        }
      else if (e.key === "Escape")      { setAnnotationStyles({}); clearPremove(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullHistory.length, isLiveView, pgnIndex, baseOrientation, muteOn]);

  // Players e info
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
  const topClockMs = topColor === "w" ? liveTimes.w : liveTimes.b;
  const bottomClockMs = bottomColor === "w" ? liveTimes.w : liveTimes.b;
  const hasPremove = premoveRef.current.length > 0;

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

  const drawOfferedByMe   = match.draw_offered_by === viewerId;
  const drawOfferedByOpp  = match.draw_offered_by !== null && !drawOfferedByMe && match.draw_offered_by !== undefined;
  const rematchOfferedByMe  = match.rematch_offered_by === viewerId;
  const rematchOfferedByOpp = match.rematch_offered_by !== null && !rematchOfferedByMe && match.rematch_offered_by !== undefined;

  const promotionColor = myColor ?? "w";

  // Posição da peça de promoção como % do tabuleiro
  const promotionStyle = useMemo<React.CSSProperties | null>(() => {
    if (!promotionPending) return null;
    const file = promotionPending.to.charCodeAt(0) - "a".charCodeAt(0); // 0..7
    const rank = parseInt(promotionPending.to[1], 10);                   // 1..8
    const fileIdx = orientation === "white" ? file : 7 - file;
    const rankIdx = orientation === "white" ? 8 - rank : rank - 1;       // 0 = top
    return {
      left:  `${fileIdx * 12.5}%`,
      top:   `${rankIdx * 12.5}%`,
      width: "12.5%",
      // Direção: se promovendo no topo, pilha vai pra baixo; se na base, pilha vai pra cima
      transform: rankIdx === 0 ? "translate(0,0)" : "translate(0, calc(-300% + 12.5% * 4))",
    };
  }, [promotionPending, orientation]);

  // Eventos do modal de fim de jogo
  const iWon       = match.winner?.id === viewerId;
  const iAmInvolved = isPlayer && match.status === "FINISHED";
  const endLabel   = resultLabel(match.result);
  const endSubtitle = (() => {
    if (!iAmInvolved) return null;
    if (match.result?.includes("DRAW")) return "Apostas devolvidas. Rating ajustado.";
    if (iWon && match.payout > 0) return `Você ganhou ${formatCoins(match.payout)} coins.`;
    if (!iWon && match.wager > 0) return `Você perdeu ${formatCoins(match.wager)} coins.`;
    return null;
  })();

  return (
    <div className="grid gap-3 lg:gap-4 lg:grid-cols-[1fr_320px]">
      {/* Game-over modal */}
      {endVisible && match.status === "FINISHED" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl">
                {match.result?.includes("DRAW")
                  ? "🤝"
                  : iAmInvolved
                    ? iWon ? "👑" : "😔"
                    : "🏁"}
              </div>
              <h2 className="mt-2 text-xl font-bold">
                {iAmInvolved
                  ? iWon ? "Vitória!" : match.result?.includes("DRAW") ? "Empate" : "Derrota"
                  : "Partida encerrada"}
              </h2>
              <p className="mt-1 text-sm text-muted">{endLabel}</p>
              {endSubtitle && <p className="mt-2 text-sm">{endSubtitle}</p>}
              {match.winner && !match.result?.includes("DRAW") && (
                <p className="mt-1 text-xs text-muted">Vencedor: <span className="font-mono">@{match.winner.username}</span></p>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {isPlayer && !isBotMatch && (
                match.rematch_match_id ? (
                  <Link href={`/match/${match.rematch_match_id}`} className="btn-primary col-span-2 text-center">
                    🔁 Ir para o rematch
                  </Link>
                ) : rematchOfferedByOpp ? (
                  <button onClick={requestRematch} disabled={busy} className="btn-primary col-span-2">Aceitar rematch 🔁</button>
                ) : rematchOfferedByMe ? (
                  <div className="col-span-2 rounded border border-accent/30 px-3 py-2 text-center text-xs text-accent">
                    Aguardando rematch…
                  </div>
                ) : (
                  <button onClick={requestRematch} disabled={busy} className="btn-primary col-span-2">Pedir rematch 🔁</button>
                )
              )}
              <Link href="/lobby" className="btn-secondary text-center">Lobby</Link>
              <button onClick={() => setEndVisible(false)} className="btn-secondary">Ver tabuleiro</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Toasts */}
      {achievements.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {achievements.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-glow">
              <span className="text-2xl">{a.icon}</span>
              <div>
                <div className="text-xs font-bold text-accent">Nova conquista!</div>
                <div className="text-sm font-semibold">{a.name}</div>
                {a.reward_coins > 0 && <div className="text-xs text-success">+{a.reward_coins} coins</div>}
              </div>
              <button
                onClick={() => setAchievements((prev) => prev.filter((x) => x.id !== a.id))}
                className="ml-2 text-muted hover:text-white"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {skinDrop && (
        <div className="fixed bottom-4 left-4 z-50">
          <div className="flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 shadow-glow"
               style={{ borderColor: RARITY_COLORS[skinDrop.rarity] + "66" }}>
            <span className="text-2xl">🎁</span>
            <div>
              <div className="text-xs font-bold" style={{ color: RARITY_COLORS[skinDrop.rarity] }}>
                Drop de skin! ({RARITY_LABELS[skinDrop.rarity]})
              </div>
              <div className="text-sm font-semibold">{skinDrop.skin_name}</div>
              <Link href="/inventory" className="text-xs text-accent hover:underline">Ver inventário</Link>
            </div>
            <button onClick={() => setSkinDrop(null)} className="ml-2 text-muted hover:text-white">×</button>
          </div>
        </div>
      )}

      {/* Board column */}
      <div className="mx-auto w-full max-w-[min(85vh,100%)] space-y-2 lg:max-w-none">
        <div className="flex items-center justify-between py-1">
          <h1 className="text-sm font-medium text-muted">
            Partida <span className="font-mono text-white">#{match.id.slice(-6)}</span>
            {isBotMatch && (
              <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">vs Bot</span>
            )}
            {hasClock && (
              <span className="ml-2 rounded-full border border-border bg-surfaceAlt px-2 py-0.5 text-[10px] text-muted">
                ⏱ {Math.round((match.time_control_seconds ?? 0) / 60)}{match.time_increment_seconds > 0 ? `+${match.time_increment_seconds}` : ""}
              </span>
            )}
            {orientationOverride && (
              <span className="ml-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">
                Tabuleiro invertido
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => { const v = !muteOn; setMuted(v); setMuteOnState(v); }}
              title={muteOn ? "Som: desativado (M)" : "Som: ativado (M)"}
              className="text-muted transition-colors hover:text-white"
            >{muteOn ? "🔇" : "🔊"}</button>
            <button
              onClick={() => setOrientationOverride((v) => v ? null : (baseOrientation === "white" ? "black" : "white"))}
              title="Inverter tabuleiro (F)"
              className="text-muted transition-colors hover:text-white"
            >⇅</button>
            <button
              onClick={() => copyText(typeof window !== "undefined" ? window.location.href : "", "url")}
              title="Copiar link da partida"
              className="text-muted transition-colors hover:text-white"
            >{copied === "url" ? "✓ Copiado" : "🔗"}</button>
            <Link href="/lobby" className="text-muted transition-colors hover:text-white">← Lobby</Link>
          </div>
        </div>

        <PlayerBar
          user={topUser}
          color={topColor}
          isTurn={topIsTurn}
          placeholder={topPlaceholder}
          captured={topCaptured}
          advantage={topAdvantage}
          isMe={topIsMe}
          clockMs={topClockMs}
          hasClock={hasClock}
          isLowTime={hasClock && topIsTurn && (topClockMs ?? Infinity) < 30_000}
          incrementBump={incrementBump?.color === topColor ? incrementBump : null}
        />

        <div className="relative">
          <Chessboard
            position={displayFen}
            boardOrientation={orientation}
            onPieceDrop={isLiveView ? onDrop : () => false}
            onSquareClick={onSquareClick}
            onSquareRightClick={onSquareRightClick}
            arePiecesDraggable={isLiveView && (isMyTurn || (!isMyTurn && isPlayer && match.status === "ACTIVE")) && !busy}
            customSquareStyles={customSquareStyles}
            customArrows={customArrows}
            showBoardNotation={true}
            animationDuration={150}
            customBoardStyle={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.65)" }}
            customDarkSquareStyle={{ backgroundColor: skin.boardDark }}
            customLightSquareStyle={{ backgroundColor: skin.boardLight }}
          />
          {sendingMove && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}
          {!isLiveView && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-purple-500/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              navegando — lance {pgnIndex} / {fullHistory.length}
            </div>
          )}
          {/* Picker de promoção sobre a casa */}
          {promotionPending && promotionStyle && (
            <div className="absolute z-20" style={promotionStyle}>
              <div className="flex flex-col overflow-hidden rounded-md border border-accent/60 bg-surface shadow-2xl">
                {(["q","r","b","n"] as const).map((p, i) => (
                  <button
                    key={p}
                    onClick={() => confirmPromotion(p)}
                    className="flex items-center justify-center bg-surface text-2xl text-white transition-colors hover:bg-accent/30"
                    style={{ aspectRatio: "1 / 1" }}
                    title={i === 0 ? "Rainha (Q)" : i === 1 ? "Torre (R)" : i === 2 ? "Bispo (B)" : "Cavalo (N)"}
                  >{promotionColor === "w" ? ({q:"♕",r:"♖",b:"♗",n:"♘"} as Record<string,string>)[p] : ({q:"♛",r:"♜",b:"♝",n:"♞"} as Record<string,string>)[p]}</button>
                ))}
                <button onClick={() => setPromotionPending(null)} className="bg-surfaceAlt py-0.5 text-[10px] text-muted hover:text-danger">×</button>
              </div>
            </div>
          )}
        </div>

        {/* Opening */}
        {openingName && (
          <div className="rounded border border-border bg-surfaceAlt/40 px-3 py-1 text-center text-xs text-muted">
            📖 {openingName}
          </div>
        )}

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
          clockMs={bottomClockMs}
          hasClock={hasClock}
          isLowTime={hasClock && bottomIsTurn && (bottomClockMs ?? Infinity) < 30_000}
          incrementBump={incrementBump?.color === bottomColor ? incrementBump : null}
        />

        {/* Draw offer banner */}
        {match.status === "ACTIVE" && isPlayer && drawOfferedByOpp && (
          <div className="flex items-center justify-between rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm">
            <span>O oponente está oferecendo empate.</span>
            <div className="flex gap-2">
              <button onClick={() => drawAction("accept")} disabled={busy} className="btn-primary py-1 text-xs">Aceitar</button>
              <button onClick={() => drawAction("decline")} disabled={busy} className="btn-secondary py-1 text-xs">Recusar</button>
            </div>
          </div>
        )}
        {match.status === "ACTIVE" && isPlayer && drawOfferedByMe && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
            Aguardando resposta do oponente para o empate…
          </div>
        )}

        {hasPremove && (
          <div className="flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs">
            <span className="text-purple-300">
              {premoveRef.current.length} pré-lance{premoveRef.current.length > 1 ? "s" : ""} na fila
            </span>
            <button onClick={clearPremove} className="text-muted hover:text-white">Cancelar</button>
          </div>
        )}

        {/* Claim de empate */}
        {drawClaimable && (
          <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs">
            <span className="text-blue-300">Posição empatada ({drawClaimable})</span>
            <button onClick={claimDraw} disabled={busy} className="rounded bg-blue-500/30 px-2 py-0.5 text-white hover:bg-blue-500/50">
              Reivindicar empate
            </button>
          </div>
        )}

        {error && (
          <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}

        {/* Cheat-sheet de atalhos */}
        {match.status === "ACTIVE" && isPlayer && (
          <div className="text-[10px] text-muted/70">
            <kbd className="rounded border border-border bg-surfaceAlt px-1">←</kbd> <kbd className="rounded border border-border bg-surfaceAlt px-1">→</kbd> navegar lances ·
            <kbd className="ml-2 rounded border border-border bg-surfaceAlt px-1">F</kbd> inverter ·
            <kbd className="ml-2 rounded border border-border bg-surfaceAlt px-1">M</kbd> som ·
            <kbd className="ml-2 rounded border border-border bg-surfaceAlt px-1">Esc</kbd> limpar marcações · right-click marca casas
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
                {match.creator_id === viewerId ? "Aguardando oponente entrar…" : "Você pode entrar nesta partida."}
              </p>
            )}
            {match.status === "ACTIVE" && (
              <p className={isMyTurn ? "font-medium text-accent" : "text-muted"}>
                {isPlayer ? (isMyTurn ? "Sua vez de jogar." : "Aguardando o oponente…") : "Partida em andamento."}
              </p>
            )}
            {match.status === "FINISHED" && (
              <div className="space-y-1">
                <p className="font-medium">{resultLabel(match.result)}</p>
                {match.payout > 0 && (
                  <p className="text-xs text-muted">
                    Prêmio: <span className="font-semibold text-success">{formatCoins(match.payout)} coins</span> → @{match.winner?.username}
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
              <>
                {!isBotMatch && !drawOfferedByMe && !drawOfferedByOpp && (
                  <button onClick={() => drawAction("offer")} disabled={busy} className="btn-secondary">Oferecer empate</button>
                )}
                <button onClick={resign} disabled={busy} className="btn-danger">Desistir</button>
              </>
            )}
            {match.status === "FINISHED" && (
              <>
                {isPlayer && !isBotMatch && (
                  match.rematch_match_id ? (
                    <Link href={`/match/${match.rematch_match_id}`} className="btn-primary text-center">Ir para o rematch</Link>
                  ) : rematchOfferedByMe ? (
                    <div className="rounded border border-accent/30 px-3 py-2 text-center text-xs text-accent">Aguardando oponente aceitar o rematch…</div>
                  ) : rematchOfferedByOpp ? (
                    <button onClick={requestRematch} disabled={busy} className="btn-primary">Aceitar rematch</button>
                  ) : (
                    <button onClick={requestRematch} disabled={busy} className="btn-secondary">Pedir rematch</button>
                  )
                )}
                <Link href="/lobby" className="btn-primary text-center">Voltar ao lobby</Link>
                <Link href="/achievements" className="btn-secondary text-center text-xs">Ver conquistas</Link>
                {isPlayer && !isBotMatch && (
                  reportSent ? (
                    <div className="rounded border border-success/30 px-3 py-2 text-center text-xs text-success">Denúncia enviada ✓</div>
                  ) : (
                    <button
                      onClick={() => setReportOpen(true)}
                      className="rounded border border-danger/30 px-3 py-2 text-xs text-danger transition-colors hover:border-danger/60 hover:bg-danger/10"
                    >Denunciar oponente</button>
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
              <button onClick={() => copyText(match.fen, "fen")} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/50 hover:text-accent">
                {copied === "fen" ? "✓ FEN" : "FEN"}
              </button>
              <button onClick={() => copyText(match.pgn || "", "pgn")} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent/50 hover:text-accent">
                {copied === "pgn" ? "✓ PGN" : "PGN"}
              </button>
            </div>
          </div>
          {fullHistory.length > 0 && (
            <div className="mb-2 flex items-center justify-between gap-1 text-[11px]">
              <button onClick={() => setPgnIndex(0)} disabled={(pgnIndex ?? fullHistory.length) === 0} className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent/50 hover:text-accent disabled:opacity-30">⏮</button>
              <button onClick={() => setPgnIndex(Math.max(0, (pgnIndex ?? fullHistory.length) - 1))} disabled={(pgnIndex ?? fullHistory.length) === 0} className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent/50 hover:text-accent disabled:opacity-30">◀</button>
              <button onClick={() => setPgnIndex(Math.min(fullHistory.length, (pgnIndex ?? fullHistory.length) + 1))} disabled={isLiveView} className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent/50 hover:text-accent disabled:opacity-30">▶</button>
              <button onClick={() => setPgnIndex(null)} disabled={isLiveView} className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent/50 hover:text-accent disabled:opacity-30">⏭</button>
              {!isLiveView && (
                <button onClick={() => setPgnIndex(null)} className="ml-1 rounded bg-accent/20 px-2 py-0.5 text-[10px] text-accent hover:bg-accent/30">ao vivo</button>
              )}
            </div>
          )}
          <div className="scrollbar-thin max-h-52 overflow-y-auto">
            <PgnList
              pgn={match.pgn}
              moveCount={match.move_count}
              currentIndex={isLiveView ? fullHistory.length : pgnIndex ?? 0}
              onClickMove={(idx) => setPgnIndex(idx)}
            />
          </div>
        </div>

        {/* Chat */}
        {(isPlayer || match.status === "FINISHED") && !isBotMatch && (
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Chat {messages.length > 0 && <span className="text-white">({messages.length})</span>}
              </h3>
              <button onClick={() => setChatOpen((v) => !v)} className="text-[10px] text-muted hover:text-white">
                {chatOpen ? "ocultar" : "mostrar"}
              </button>
            </div>
            {chatOpen && (
              <>
                <div ref={chatListRef} className="scrollbar-thin mb-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {messages.length === 0 ? (
                    <p className="text-muted">Sem mensagens ainda.</p>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.user_id === viewerId;
                      return (
                        <div key={m.id} className={`rounded px-2 py-1 ${isMine ? "bg-accent/10 text-white" : "bg-surfaceAlt text-white"}`}>
                          <span className="mr-1 font-mono text-[10px] text-muted">
                            {isMine ? "você" : `@${m.user?.username ?? "?"}`}:
                          </span>
                          <span>{m.content}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                {isPlayer && (
                  <form onSubmit={sendChat} className="flex gap-1">
                    <input
                      type="text"
                      maxLength={240}
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      placeholder="Mensagem…"
                      className="input flex-1 py-1 text-xs"
                    />
                    <button type="submit" disabled={!chatDraft.trim()} className="btn-primary px-3 py-1 text-xs">↑</button>
                  </form>
                )}
                {chatError && <p className="mt-1 text-[10px] text-danger">{chatError}</p>}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function PlayerBar({
  user, color, isTurn, placeholder, captured, advantage, isMe,
  clockMs, hasClock, isLowTime, incrementBump,
}: {
  user: { id?: string; username: string; rating: number; games_played?: number } | null;
  color: "w" | "b";
  isTurn: boolean;
  placeholder: string;
  captured: string[];
  advantage: number;
  isMe?: boolean;
  clockMs: number | null;
  hasClock: boolean;
  isLowTime: boolean;
  incrementBump: { color: "w" | "b"; amount: number; key: number } | null;
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
              {isMe || !user.id ? (
                <span className="truncate text-sm font-semibold">{isMe ? "Você" : `@${user.username}`}</span>
              ) : (
                <UserPopover userId={user.id}>
                  <span className="truncate text-sm font-semibold">@{user.username}</span>
                </UserPopover>
              )}
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
      {hasClock && (
        <div className="relative shrink-0">
          <div className={`rounded px-2 py-0.5 font-mono text-sm tabular-nums transition-colors ${
            isLowTime ? "animate-pulse bg-danger/25 text-danger" : isTurn ? "bg-accent/20 text-accent" : "bg-surface text-muted"
          }`}>
            {formatClock(clockMs)}
          </div>
          {incrementBump && (
            <span
              key={incrementBump.key}
              className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-success animate-float-up"
            >
              +{incrementBump.amount}s
            </span>
          )}
        </div>
      )}
      {!hasClock && isTurn && (
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
    if (result?.includes("TIMEOUT")) return <span className="badge-danger text-[10px]">Por tempo</span>;
    return <span className="badge-success text-[10px]">Finalizada</span>;
  }
  if (status === "CANCELLED") return <span className="badge-danger text-[10px]">Cancelada</span>;
  return null;
}

function PgnList({
  pgn, moveCount, currentIndex, onClickMove,
}: {
  pgn: string;
  moveCount: number;
  currentIndex: number;
  onClickMove: (index: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  const pairs = useMemo(() => {
    if (!pgn) return [];
    const tokens = pgn
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
  }, [pgn]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [moveCount]);

  if (!pgn || pairs.length === 0)
    return <p className="text-xs text-muted">Sem lances ainda.</p>;

  return (
    <ol ref={listRef} className="space-y-0.5 font-mono text-xs">
      {pairs.map((p) => (
        <li key={p.num} className="flex gap-2 rounded px-1 py-0.5 hover:bg-surfaceAlt">
          <span className="w-5 shrink-0 text-muted">{p.num}.</span>
          <button
            type="button"
            onClick={() => p.wIdx && onClickMove(p.wIdx)}
            className={`w-14 shrink-0 cursor-pointer rounded px-1 text-left ${
              p.wIdx === currentIndex ? "bg-accent/30 font-bold text-accent" : "hover:bg-accent/10"
            }`}
          >{p.w ?? ""}</button>
          <button
            type="button"
            onClick={() => p.bIdx && onClickMove(p.bIdx)}
            className={`w-14 shrink-0 cursor-pointer rounded px-1 text-left ${
              p.bIdx === currentIndex ? "bg-accent/30 font-bold text-accent" : "hover:bg-accent/10"
            }`}
          >{p.b ?? ""}</button>
        </li>
      ))}
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
