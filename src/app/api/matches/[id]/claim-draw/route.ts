import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "claim-draw"), {
    capacity: 4, refillPerSecond: 0.5,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Aguarde antes de reivindicar de novo." }, { status: 429 });
  }

  const { data: match } = await supabase
    .from("chess_matches")
    .select("id, status, white_user_id, black_user_id, fen, pgn, bot_difficulty")
    .eq("id", params.id)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "ACTIVE") {
    return NextResponse.json({ error: "Partida não está ativa" }, { status: 400 });
  }
  if (match.white_user_id !== session.user.id && match.black_user_id !== session.user.id) {
    return NextResponse.json({ error: "Você não está nesta partida" }, { status: 403 });
  }

  // Valida que a posição realmente permite claim
  const c = new Chess();
  try {
    if (match.pgn) c.loadPgn(match.pgn);
    else c.load(match.fen);
  } catch { c.load(match.fen); }

  const threefold       = c.isThreefoldRepetition?.() === true;
  const insufficient    = c.isInsufficientMaterial?.() === true;
  // chess.js v1 não expõe 50-move diretamente; isDraw() retorna true se aplicável (cobre 50-move + stalemate)
  const fiftyOrAuto     = c.isDraw?.() === true;

  if (!threefold && !insufficient && !fiftyOrAuto) {
    return NextResponse.json({ error: "Não há base para reivindicar empate" }, { status: 400 });
  }

  // Reutiliza chess_accept_draw após registrar uma oferta automática
  // do próprio reivindicante para fechar o jogo como DRAW. Mais simples:
  // chamamos uma RPC dedicada que finaliza imediatamente.
  const { error } = await supabase.rpc("chess_claim_draw", {
    p_user_id:  session.user.id,
    p_match_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
