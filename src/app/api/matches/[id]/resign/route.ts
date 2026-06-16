import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { error } = await supabase.rpc("chess_resign_match", {
    p_user_id: session.user.id,
    p_match_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  const { data } = await supabase
    .from("chess_matches")
    .select(
      `*,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating),
       winner:winner_id(id, username)`
    )
    .eq("id", params.id)
    .maybeSingle();
  return NextResponse.json({ ok: true, match: data });
}
