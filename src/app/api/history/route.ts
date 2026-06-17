import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;
  const { data } = await supabase
    .from("chess_matches")
    .select(
      `id, wager, status, result, winner_id, payout, move_count, white_user_id, black_user_id,
       time_control_seconds, time_increment_seconds, bot_difficulty,
       finished_at, created_at,
       white_user:white_user_id(id, username),
       black_user:black_user_id(id, username),
       winner:winner_id(id, username)`
    )
    .or(`white_user_id.eq.${userId},black_user_id.eq.${userId}`)
    .in("status", ["FINISHED", "CANCELLED"])
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(200);
  return NextResponse.json({ matches: data ?? [] });
}
