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
  const { data, error } = await supabase
    .from("chess_moves")
    .select("ply, san, uci, fen_after, by_user_id, move_time_ms, created_at")
    .eq("match_id", params.id)
    .order("ply", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ moves: data ?? [] });
}
