import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "flag-time"), {
    capacity: 5, refillPerSecond: 1,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Aguarde antes de reivindicar de novo." }, { status: 429 });
  }

  const { error } = await supabase.rpc("chess_flag_time", {
    p_user_id:  session.user.id,
    p_match_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
