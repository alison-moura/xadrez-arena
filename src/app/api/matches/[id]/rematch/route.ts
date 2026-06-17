import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const schema = z.object({ action: z.enum(["request", "cancel"]).optional() });

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "rematch"), {
    capacity: 3, refillPerSecond: 0.2,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitos pedidos de rematch. Espere." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const action = parsed.success ? (parsed.data.action ?? "request") : "request";

  if (action === "cancel") {
    const { error } = await supabase.rpc("chess_cancel_rematch", {
      p_user_id:  session.user.id,
      p_match_id: params.id,
    });
    if (error) return NextResponse.json({ error: rpcError(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase.rpc("chess_request_rematch", {
    p_user_id:  session.user.id,
    p_match_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: data });
}
