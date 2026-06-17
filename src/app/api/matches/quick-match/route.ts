import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  timeControlSeconds:   z.number().int().min(30).max(7200).nullable().optional(),
  timeIncrementSeconds: z.number().int().min(0).max(60).optional(),
  wager:                z.number().int().min(0).max(1_000_000).optional(),
});

// Procura uma partida WAITING compatível e tenta entrar.
// Se não houver, cria uma própria com as preferências passadas.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "quick-match"), {
    capacity: 4, refillPerSecond: 0.3,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Aguarde antes de buscar outra partida." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { timeControlSeconds = 300, timeIncrementSeconds = 3, wager = 0 } = parsed.data;

  const { data: me } = await supabase
    .from("chess_users")
    .select("rating, games_played, banned_at")
    .eq("id", session.user.id)
    .single();
  if (me?.banned_at) return NextResponse.json({ error: "Conta banida" }, { status: 403 });
  const myRating = me?.rating ?? 1200;

  // Candidatos: WAITING, sem bot, mesmo time control (exato), wager <= o seu, e
  // que aceitem nosso rating
  const { data: candidates } = await supabase
    .from("chess_matches")
    .select("id, wager, creator_id, rating_min, rating_max, time_control_seconds, time_increment_seconds")
    .eq("status", "WAITING")
    .is("bot_difficulty", null)
    .eq("time_control_seconds", timeControlSeconds as number | null)
    .order("created_at", { ascending: true })
    .limit(50);

  for (const c of candidates ?? []) {
    if (c.creator_id === session.user.id) continue;
    if ((c.time_increment_seconds ?? 0) !== timeIncrementSeconds) continue;
    if (c.wager > wager) continue;
    if (c.rating_min != null && myRating < c.rating_min) continue;
    if (c.rating_max != null && myRating > c.rating_max) continue;

    // Tenta entrar
    const { error } = await supabase.rpc("chess_join_match", {
      p_user_id:  session.user.id,
      p_match_id: c.id,
    });
    if (!error) {
      return NextResponse.json({ ok: true, matchId: c.id, joined: true });
    }
    // Conflito (já preenchido por outro): tenta o próximo
  }

  // Sem candidatos → cria
  const { data: created, error: createErr } = await supabase.rpc("chess_create_match", {
    p_user_id:                session.user.id,
    p_wager:                  wager,
    p_color:                  "random",
    p_rating_min:             null,
    p_rating_max:             null,
    p_time_control_seconds:   timeControlSeconds ?? null,
    p_time_increment_seconds: timeIncrementSeconds ?? 0,
  });
  if (createErr) {
    return NextResponse.json({ error: rpcError(createErr) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, matchId: (created as { match_id: string }).match_id, joined: false });
}
