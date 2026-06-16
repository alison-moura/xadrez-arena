import { supabase } from "@/lib/supabase";
import { applyMove } from "@/lib/chess-engine";
import { pickBotMove, BOT_USER_ID, type Difficulty } from "@/lib/chess-bot";

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

  const move = pickBotMove(match.fen, match.bot_difficulty as Difficulty);
  if (!move) return;

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
