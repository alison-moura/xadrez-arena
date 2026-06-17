import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const schema = z.object({
  action: z.enum(["offer", "accept", "decline"]),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "draw"), {
    capacity: 5, refillPerSecond: 0.5,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Calma com as ofertas de empate." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const fn = parsed.data.action === "offer"
    ? "chess_offer_draw"
    : parsed.data.action === "accept"
      ? "chess_accept_draw"
      : "chess_decline_draw";

  const { data, error } = await supabase.rpc(fn, {
    p_user_id:  session.user.id,
    p_match_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: data });
}
