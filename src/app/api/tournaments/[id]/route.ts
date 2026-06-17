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

  const { data: t } = await supabase
    .from("chess_tournaments")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const { data: players } = await supabase
    .from("chess_tournament_players")
    .select("user_id, score, wins, draws, losses, streak, joined_at, user:user_id(id, username, rating)")
    .eq("tournament_id", params.id)
    .order("score", { ascending: false })
    .limit(100);

  const isJoined = (players ?? []).some((p) => p.user_id === session.user!.id);

  return NextResponse.json({ tournament: t, players: players ?? [], joined: isJoined });
}
