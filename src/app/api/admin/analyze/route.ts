import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { analyzeMatch, computeSuspicionScore } from "@/lib/stockfish-analysis";

const schema = z.object({
  matchId: z.string().min(1),
  depth:   z.number().int().min(5).max(20).optional().default(15),
});

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUSPICION_THRESHOLD = 60;  // flag for Overwatch at this score

export async function POST(req: Request) {
  // Simple secret-key auth for admin endpoints
  const authHeader = req.headers.get("authorization");
  if (!ADMIN_SECRET || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { matchId, depth } = parsed.data;

  // Fetch match
  const { data: match } = await supabase
    .from("chess_matches")
    .select("id, pgn, status, move_count, bot_difficulty, white_user_id, black_user_id, analyzed_at")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "FINISHED") {
    return NextResponse.json({ error: "Partida ainda não finalizada" }, { status: 400 });
  }
  if (match.bot_difficulty) {
    return NextResponse.json({ error: "Análise não aplicável a partidas vs bot" }, { status: 400 });
  }

  const analysis = await analyzeMatch(match.pgn, depth);
  if (!analysis) {
    return NextResponse.json({ error: "Falha na análise (Stockfish não disponível ou PGN inválido)" }, { status: 500 });
  }

  // Persist analysis results
  await supabase
    .from("chess_matches")
    .update({
      white_avg_cpl:  analysis.white.avgCpl,
      black_avg_cpl:  analysis.black.avgCpl,
      white_accuracy: analysis.white.accuracy,
      black_accuracy: analysis.black.accuracy,
      analyzed_at:    new Date().toISOString(),
    })
    .eq("id", matchId);

  // Compute suspicion score and update users
  const suspicion = computeSuspicionScore(analysis, match.move_count);

  const playersToFlag: Array<{ id: string; color: "white" | "black"; avgCpl: number }> = [];

  if (match.white_user_id && analysis.white.avgCpl < 25) {
    playersToFlag.push({ id: match.white_user_id, color: "white", avgCpl: analysis.white.avgCpl });
  }
  if (match.black_user_id && analysis.black.avgCpl < 25) {
    playersToFlag.push({ id: match.black_user_id, color: "black", avgCpl: analysis.black.avgCpl });
  }

  const flaggedUsers: string[] = [];
  for (const player of playersToFlag) {
    // Increment suspicion_score
    const { data: user } = await supabase
      .from("chess_users")
      .select("suspicion_score")
      .eq("id", player.id)
      .maybeSingle();

    const currentScore = user?.suspicion_score ?? 0;
    const addScore = suspicion / 2;
    const newScore = Math.min(100, currentScore + addScore);

    await supabase
      .from("chess_users")
      .update({ suspicion_score: newScore })
      .eq("id", player.id);

    // Create Overwatch case if suspicion is high and not already exists
    if (newScore >= SUSPICION_THRESHOLD) {
      const exists = await supabase
        .from("chess_overwatch_cases")
        .select("id", { head: true })
        .eq("match_id", matchId)
        .eq("accused_id", player.id)
        .maybeSingle();

      if (!exists.data) {
        await supabase.from("chess_overwatch_cases").insert({
          accused_id:   player.id,
          match_id:     matchId,
          votes_needed: 5,
        });
        flaggedUsers.push(player.id);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    matchId,
    analysis: {
      white: analysis.white,
      black: analysis.black,
      moveCount: analysis.moves.length,
    },
    suspicion,
    flaggedUsers,
  });
}
