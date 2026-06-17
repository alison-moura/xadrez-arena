import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("chess_tournaments")
    .select("id, name, description, status, starts_at, ends_at, time_control_seconds, time_increment_seconds, entry_fee, prize_pool, rating_min, rating_max")
    .in("status", ["SCHEDULED", "ACTIVE"])
    .order("starts_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((t) => t.id);
  const { data: myJoins } = ids.length > 0
    ? await supabase
        .from("chess_tournament_players")
        .select("tournament_id")
        .eq("user_id", session.user.id)
        .in("tournament_id", ids)
    : { data: [] as { tournament_id: string }[] };

  const { data: counts } = ids.length > 0
    ? await supabase
        .from("chess_tournament_players")
        .select("tournament_id")
        .in("tournament_id", ids)
    : { data: [] as { tournament_id: string }[] };

  const playerCounts = new Map<string, number>();
  for (const c of counts ?? []) {
    playerCounts.set(c.tournament_id, (playerCounts.get(c.tournament_id) ?? 0) + 1);
  }
  const joinedSet = new Set((myJoins ?? []).map((j) => j.tournament_id));

  return NextResponse.json({
    tournaments: (data ?? []).map((t) => ({
      ...t,
      player_count: playerCounts.get(t.id) ?? 0,
      joined:       joinedSet.has(t.id),
    })),
  });
}
