import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Desafios diretos pendentes: recebidos (pra aceitar/recusar) e enviados (pra acompanhar/cancelar).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const fields = `id, wager, created_at, creator_id, challenged_user_id,
    time_control_seconds, time_increment_seconds,
    white_user:white_user_id(id, username, rating),
    black_user:black_user_id(id, username, rating),
    challenged:challenged_user_id(id, username, rating)`;

  const [incoming, outgoing] = await Promise.all([
    supabase
      .from("chess_matches")
      .select(fields)
      .eq("status", "WAITING")
      .eq("challenged_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("chess_matches")
      .select(fields)
      .eq("status", "WAITING")
      .eq("creator_id", userId)
      .not("challenged_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (incoming.error || outgoing.error) {
    return NextResponse.json(
      { error: incoming.error?.message ?? outgoing.error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    incoming: incoming.data ?? [],
    outgoing: outgoing.data ?? [],
  });
}
