import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { applyMove } from "@/lib/chess-engine";
import { playBotMove } from "@/lib/bot-runner";
import type { ChessMatch } from "@/lib/types";

const schema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.string().length(1).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lance inválido" }, { status: 400 });
  }

  const { data: match, error: matchErr } = await supabase
    .from("chess_matches")
    .select("id, status, white_user_id, black_user_id, turn, fen, pgn, move_count, bot_difficulty")
    .eq("id", params.id)
    .maybeSingle<Pick<ChessMatch, "id" | "status" | "white_user_id" | "black_user_id" | "turn" | "fen" | "pgn" | "move_count"> & { bot_difficulty: string | null }>();

  if (matchErr || !match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "ACTIVE") {
    return NextResponse.json({ error: "Partida não está ativa" }, { status: 400 });
  }
  const isWhite = match.white_user_id === session.user.id;
  const isBlack = match.black_user_id === session.user.id;
  if (!isWhite && !isBlack) {
    return NextResponse.json({ error: "Você não está nesta partida" }, { status: 403 });
  }
  const myColor = isWhite ? "w" : "b";
  if (match.turn !== myColor) {
    return NextResponse.json({ error: "Não é sua vez" }, { status: 400 });
  }

  const moveRes = applyMove(match.fen, match.pgn, parsed.data);
  if (!moveRes) {
    return NextResponse.json({ error: "Lance ilegal" }, { status: 400 });
  }

  const { error: rpcErr } = await supabase.rpc("chess_record_move", {
    p_user_id: session.user.id,
    p_match_id: params.id,
    p_fen: moveRes.fen,
    p_pgn: moveRes.pgn,
    p_san: moveRes.san,
    p_uci: moveRes.uci,
    p_turn: moveRes.turn,
    p_is_checkmate: moveRes.isCheckmate,
    p_is_draw: moveRes.isDraw || moveRes.isStalemate,
    p_is_game_over: moveRes.isGameOver,
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcError(rpcErr) }, { status: 400 });
  }

  // se for partida vs bot e o jogo continua, deixa o bot jogar antes de devolver
  if (match.bot_difficulty && !moveRes.isGameOver) {
    await playBotMove(params.id);
  }

  // retorna estado atualizado
  const { data: updated } = await supabase
    .from("chess_matches")
    .select(
      `*,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating),
       winner:winner_id(id, username)`
    )
    .eq("id", params.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, match: updated });
}
