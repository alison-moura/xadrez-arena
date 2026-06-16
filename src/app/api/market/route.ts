import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("chess_skin_listings")
    .select("*, seller:seller_id(id, username), skin_pack:skin_pack_id(*)")
    .eq("status", "active")
    .order("listed_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data ?? [] });
}

const listSchema = z.object({
  userSkinId: z.string().uuid(),
  price: z.number().int().min(1).max(10_000_000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = listSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { error } = await supabase.rpc("chess_list_skin", {
    p_user_id: session.user.id,
    p_user_skin_id: parsed.data.userSkinId,
    p_price: parsed.data.price,
  });

  if (error) return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
