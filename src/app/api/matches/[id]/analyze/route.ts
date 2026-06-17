import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { analyzeMatch } from "@/lib/stockfish-analysis";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// User-facing analysis trigger. Idempotente: se já analisada, retorna o cache.
// Requer Stockfish disponível no servidor (não está garantido no Vercel —
// neste caso, retornamos um erro descritivo).
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "analyze"), {
    capacity: 2, refillPerSecond: 0.05, // 1 a cada 20s, sustentado
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Aguarde antes de pedir outra análise." }, { status: 429 });
  }

  const { data: match } = await supabase
    .from("chess_matches")
    .select("id, pgn, status, bot_difficulty, white_user_id, black_user_id, white_avg_cpl, black_avg_cpl, white_accuracy, black_accuracy, analyzed_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "FINISHED") {
    return NextResponse.json({ error: "Partida ainda não finalizada" }, { status: 400 });
  }
  if (match.bot_difficulty) {
    return NextResponse.json({ error: "Análise indisponível para partidas vs bot" }, { status: 400 });
  }
  if (match.white_user_id !== session.user.id && match.black_user_id !== session.user.id) {
    return NextResponse.json({ error: "Você não jogou nessa partida" }, { status: 403 });
  }

  // Cache hit
  if (match.analyzed_at) {
    return NextResponse.json({
      ok: true,
      cached: true,
      analysis: {
        white_avg_cpl:  match.white_avg_cpl,
        black_avg_cpl:  match.black_avg_cpl,
        white_accuracy: match.white_accuracy,
        black_accuracy: match.black_accuracy,
        analyzed_at:    match.analyzed_at,
      },
    });
  }

  // Run Stockfish (pode falhar se binário não está presente)
  const result = await analyzeMatch(match.pgn, 12).catch(() => null);
  if (!result) {
    return NextResponse.json({
      error: "Análise indisponível neste servidor. O binário Stockfish não foi encontrado.",
      unavailable: true,
    }, { status: 503 });
  }

  await supabase
    .from("chess_matches")
    .update({
      white_avg_cpl:  result.white.avgCpl,
      black_avg_cpl:  result.black.avgCpl,
      white_accuracy: result.white.accuracy,
      black_accuracy: result.black.accuracy,
      analyzed_at:    new Date().toISOString(),
    })
    .eq("id", params.id);

  return NextResponse.json({
    ok: true,
    cached: false,
    analysis: {
      white_avg_cpl:  result.white.avgCpl,
      black_avg_cpl:  result.black.avgCpl,
      white_accuracy: result.white.accuracy,
      black_accuracy: result.black.accuracy,
    },
  });
}
