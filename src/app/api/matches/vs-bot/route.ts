import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { playBotMove } from "@/lib/bot-runner";

export const dynamic = "force-dynamic";

const schema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  preferredColor: z.enum(["w", "b", "random"]).default("random"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("chess_create_bot_match", {
    p_user_id: session.user.id,
    p_difficulty: parsed.data.difficulty,
    p_color: parsed.data.preferredColor,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }

  const { match_id, bot_starts } = data as { match_id: string; bot_starts: boolean };

  // Se o bot começa (jogador escolheu pretas), joga já o primeiro lance
  if (bot_starts) {
    await playBotMove(match_id);
  }

  return NextResponse.json({ ok: true, matchId: match_id });
}
