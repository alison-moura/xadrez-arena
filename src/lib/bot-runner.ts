import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { applyMove } from "@/lib/chess-engine";
import { pickBotMove, BOT_USER_ID, type Difficulty } from "@/lib/chess-bot";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Janela de tempo "humano" pra cada nível. Recapturas e xeques saem mais rápido.
const THINK_TIME: Record<Difficulty, { min: number; max: number }> = {
  easy:   { min: 400,  max: 1200 },
  medium: { min: 700,  max: 1800 },
  hard:   { min: 900,  max: 2400 },
};

function humanThinkTime(difficulty: Difficulty, isObvious: boolean): number {
  const range = THINK_TIME[difficulty];
  if (isObvious) return Math.min(range.max, 300 + Math.random() * 300);
  return range.min + Math.random() * (range.max - range.min);
}

/**
 * Calcula e grava o lance do bot para a partida em questão.
 * Assume que a partida está ACTIVE, é vez do bot e bot_difficulty está setado.
 */
export async function playBotMove(matchId: string): Promise<void> {
  const { data: match } = await supabase
    .from("chess_matches")
    .select("id, status, fen, pgn, turn, white_user_id, black_user_id, bot_difficulty")
    .eq("id", matchId)
    .maybeSingle();

  if (!match || match.status !== "ACTIVE" || !match.bot_difficulty) return;

  const botColor =
    match.white_user_id === BOT_USER_ID ? "w" :
    match.black_user_id === BOT_USER_ID ? "b" : null;
  if (!botColor || match.turn !== botColor) return;

  const difficulty = match.bot_difficulty as Difficulty;
  const move = pickBotMove(match.fen, difficulty);
  if (!move) return;

  // Detecta se é um lance "óbvio": recaptura, xeque ou única opção.
  const sim = new Chess(match.fen);
  const legal = sim.moves({ verbose: true });
  const onlyOne = legal.length === 1;
  let recapture = false;
  let givesCheck = false;
  try {
    const m = sim.move({ from: move.from, to: move.to, promotion: (move.promotion as "q" | undefined) ?? "q" });
    if (m) {
      recapture  = !!m.captured;
      givesCheck = sim.inCheck();
    }
  } catch { /* ignore */ }
  const isObvious = onlyOne || (recapture && givesCheck);

  const delay = humanThinkTime(difficulty, isObvious);
  await sleep(delay);

  const result = applyMove(match.fen, match.pgn, move);
  if (!result) return;

  await supabase.rpc("chess_record_move", {
    p_user_id: BOT_USER_ID,
    p_match_id: matchId,
    p_fen: result.fen,
    p_pgn: result.pgn,
    p_san: result.san,
    p_uci: result.uci,
    p_turn: result.turn,
    p_is_checkmate: result.isCheckmate,
    p_is_draw: result.isDraw || result.isStalemate,
    p_is_game_over: result.isGameOver,
  });
}
