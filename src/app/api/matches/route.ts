import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import type { MatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  wager: z.number().int().min(0).max(1_000_000),
  preferredColor: z.enum(["w", "b", "random"]).default("random"),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") ?? "WAITING") as MatchStatus;

  const { data, error } = await supabase
    .from("chess_matches")
    .select(
      `id, wager, status, created_at, white_user_id, black_user_id,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating)`
    )
    .eq("status", status)
    .is("bot_difficulty", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ matches: data ?? [] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("chess_create_match", {
    p_user_id: session.user.id,
    p_wager: parsed.data.wager,
    p_color: parsed.data.preferredColor,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, matchId: (data as { match_id: string }).match_id });
}
