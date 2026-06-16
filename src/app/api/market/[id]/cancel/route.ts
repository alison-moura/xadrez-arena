import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { error } = await supabase.rpc("chess_cancel_listing", {
    p_user_id: session.user.id,
    p_listing_id: params.id,
  });

  if (error) return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
