import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: users, error } = await supabase
    .from("chess_users")
    .select("id, username, rating")
    .order("rating", { ascending: false })
    .limit(20);

  if (error) {
    console.error("leaderboard users error:", JSON.stringify(error));
    return NextResponse.json({ players: [], debug: error.message }, { status: 200 });
  }
  if (!users) return NextResponse.json({ players: [] });

  const ids = users.map((u) => u.id);
  const { data: wins } = await supabase
    .from("chess_matches")
    .select("winner_id")
    .in("winner_id", ids)
    .eq("status", "FINISHED");

  const winCount = new Map<string, number>();
  for (const w of wins ?? []) {
    if (w.winner_id) winCount.set(w.winner_id, (winCount.get(w.winner_id) ?? 0) + 1);
  }

  return NextResponse.json({
    players: users.map((u) => ({
      id: u.id,
      username: u.username,
      rating: u.rating,
      wins: winCount.get(u.id) ?? 0,
    })),
  });
}
