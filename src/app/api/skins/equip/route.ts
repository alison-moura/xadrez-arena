import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

const schema = z.object({ skinId: z.string() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { error } = await supabase.rpc("chess_equip_skin", {
    p_user_id: session.user.id,
    p_skin_pack_id: parsed.data.skinId,
  });

  if (error) return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
