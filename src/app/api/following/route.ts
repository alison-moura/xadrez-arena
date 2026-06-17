import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { data } = await supabase
    .from("chess_user_follows")
    .select("followed_id, created_at, followed:followed_id(id, username, rating, last_seen_at)")
    .eq("follower_id", session.user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ following: data ?? [] });
}
