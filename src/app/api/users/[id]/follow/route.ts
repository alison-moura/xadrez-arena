import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const schema = z.object({ action: z.enum(["follow", "unfollow"]) });

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.id === params.id) {
    return NextResponse.json({ error: "Você não pode seguir você mesmo" }, { status: 400 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "follow"), {
    capacity: 10, refillPerSecond: 1,
  });
  if (!limit.ok) return NextResponse.json({ error: "Aguarde." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 });

  if (parsed.data.action === "follow") {
    const { error } = await supabase
      .from("chess_user_follows")
      .upsert({ follower_id: session.user.id, followed_id: params.id }, { onConflict: "follower_id,followed_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("chess_user_follows")
      .delete()
      .eq("follower_id", session.user.id)
      .eq("followed_id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
