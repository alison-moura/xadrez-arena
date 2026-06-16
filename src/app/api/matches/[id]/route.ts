import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("chess_matches")
    .select(
      `*,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating),
       winner:winner_id(id, username)`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  return NextResponse.json({ match: data });
}
