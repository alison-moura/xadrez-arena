import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: user } = await supabase
    .from("chess_users")
    .select("id, username, rating, games_played, is_bot, banned_at, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  // Stats agregadas: último 50 jogos finalizados não-bot
  const { data: lastMatches } = await supabase
    .from("chess_matches")
    .select("id, result, white_user_id, black_user_id, winner_id, finished_at")
    .or(`white_user_id.eq.${params.id},black_user_id.eq.${params.id}`)
    .eq("status", "FINISHED")
    .is("bot_difficulty", null)
    .order("finished_at", { ascending: false })
    .limit(50);

  let wins = 0, losses = 0, draws = 0, streak = 0;
  if (lastMatches?.length) {
    for (const m of lastMatches) {
      if (m.result?.includes("DRAW")) draws++;
      else if (m.winner_id === params.id) wins++;
      else losses++;
    }
    // streak (vitórias consecutivas mais recentes)
    for (const m of lastMatches) {
      if (m.winner_id === params.id) streak++;
      else break;
    }
  }

  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      rating: user.rating,
      games_played: user.games_played,
      is_bot: user.is_bot,
      is_banned: !!user.banned_at,
      created_at: user.created_at,
    },
    stats: {
      sample: total,
      wins, losses, draws,
      winRate,
      streak,
    },
  });
}
