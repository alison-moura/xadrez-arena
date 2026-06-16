import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const schema = z.object({ matchId: z.string() });

async function grantAchievement(userId: string, achievementId: string): Promise<boolean> {
  const { data } = await supabase.rpc("chess_grant_achievement", {
    p_user_id: userId,
    p_achievement_id: achievementId,
  });
  return data === true;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { matchId } = parsed.data;

  // Fetch match + user data
  const [matchRes, userRes, statsRes] = await Promise.all([
    supabase
      .from("chess_matches")
      .select("*, white_user:white_user_id(id,username,rating), black_user:black_user_id(id,username,rating)")
      .eq("id", matchId)
      .single(),
    supabase
      .from("chess_users")
      .select("rating")
      .eq("id", userId)
      .single(),
    supabase
      .from("chess_matches")
      .select("id, result, white_user_id, black_user_id, wager, move_count, bot_difficulty")
      .or(`white_user_id.eq.${userId},black_user_id.eq.${userId}`)
      .eq("status", "FINISHED")
      .order("finished_at", { ascending: false })
      .limit(200),
  ]);

  if (matchRes.error || !matchRes.data) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }

  const match = matchRes.data as {
    id: string;
    status: string;
    result: string | null;
    white_user_id: string | null;
    black_user_id: string | null;
    wager: number;
    move_count: number;
    bot_difficulty: string | null;
    white_user: { id: string } | null;
    black_user: { id: string } | null;
  };

  if (match.status !== "FINISHED") {
    return NextResponse.json({ newly_earned: [] });
  }

  const allMatches = statsRes.data ?? [];
  const rating = userRes.data?.rating ?? 1200;

  const userColor = match.white_user_id === userId ? "w" : "b";
  const userWon =
    (userColor === "w" && match.result === "WHITE_WIN") ||
    (userColor === "b" && match.result === "BLACK_WIN") ||
    (userColor === "w" && match.result === "BLACK_RESIGN") ||
    (userColor === "b" && match.result === "WHITE_RESIGN");

  const isBotMatch =
    match.bot_difficulty != null ||
    match.white_user === null ||
    match.black_user === null;

  const totalMatches = allMatches.length;

  // Count wins and streaks
  let totalWins = 0;
  let currentStreak = 0;
  let streakBroken = false;
  for (const m of allMatches) {
    const mColor = m.white_user_id === userId ? "w" : "b";
    const won =
      (mColor === "w" && m.result === "WHITE_WIN") ||
      (mColor === "b" && m.result === "BLACK_WIN") ||
      (mColor === "w" && m.result === "BLACK_RESIGN") ||
      (mColor === "b" && m.result === "WHITE_RESIGN");
    if (won) totalWins++;
    if (!streakBroken) {
      if (won) currentStreak++;
      else streakBroken = true;
    }
  }

  const friendlyMatches = allMatches.filter((m) => m.wager === 0).length;

  const newly_earned: string[] = [];
  const grant = async (id: string) => {
    const granted = await grantAchievement(userId, id);
    if (granted) newly_earned.push(id);
  };

  // === PARTIDAS ===
  if (userWon && totalWins === 1) await grant("primeira_vitoria");
  if (totalMatches >= 10) await grant("veterano");
  if (totalMatches >= 100) await grant("centuriao");
  if (currentStreak >= 3) await grant("sequencia_3");
  if (currentStreak >= 5) await grant("sequencia_5");
  if (currentStreak >= 10) await grant("sequencia_10");

  // === XADREZ ===
  if (userWon && match.move_count <= 15) await grant("xeque_rapido");
  if (match.move_count >= 60) await grant("longa_batalha");
  if (friendlyMatches >= 5) await grant("cinco_amistosos");

  // === BOT ===
  if (isBotMatch && userWon) await grant("primeira_bot");
  if (isBotMatch && userWon && match.bot_difficulty === "hard") await grant("vence_dificil");

  // === RATING ===
  if (rating >= 1200) await grant("rating_1200");
  if (rating >= 1500) await grant("rating_1500");
  if (rating >= 1800) await grant("rating_1800");

  // === APOSTAS ===
  if (match.wager >= 500) await grant("grande_aposta");

  // Fetch details of newly earned achievements for the UI toast
  let earned_details: Array<{ id: string; name: string; icon: string; reward_coins: number }> = [];
  if (newly_earned.length > 0) {
    const { data } = await supabase
      .from("chess_achievement_types")
      .select("id, name, icon, reward_coins")
      .in("id", newly_earned);
    earned_details = data ?? [];
  }

  return NextResponse.json({ newly_earned: earned_details });
}
