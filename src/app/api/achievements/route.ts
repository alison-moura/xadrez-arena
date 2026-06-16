import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [allTypes, userEarned] = await Promise.all([
    supabase
      .from("chess_achievement_types")
      .select("*")
      .order("sort_order"),
    supabase
      .from("chess_user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", session.user.id),
  ]);

  if (allTypes.error) {
    return NextResponse.json({ error: allTypes.error.message }, { status: 500 });
  }

  const earnedSet = new Set(
    (userEarned.data ?? []).map((r) => r.achievement_id)
  );
  const earnedDates: Record<string, string> = {};
  for (const r of userEarned.data ?? []) {
    earnedDates[r.achievement_id] = r.earned_at;
  }

  const achievements = (allTypes.data ?? []).map((a) => ({
    ...a,
    earned: earnedSet.has(a.id),
    earned_at: earnedDates[a.id] ?? null,
  }));

  return NextResponse.json({ achievements });
}
