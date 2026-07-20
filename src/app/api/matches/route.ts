import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import type { MatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const NOVICE_MATCH_THRESHOLD = 10;
const NOVICE_MAX_WAGER       = 100;

const createSchema = z.object({
  wager:                  z.number().int().min(0).max(1_000_000),
  preferredColor:         z.enum(["w", "b", "random"]).default("random"),
  ratingRange:            z.enum(["100", "200", "500", "open"]).optional(),
  timeControlSeconds:     z.number().int().min(30).max(7200).nullable().optional(),
  timeIncrementSeconds:   z.number().int().min(0).max(60).optional(),
  isPrivate:              z.boolean().optional(),
  challengedUsername:     z.string().min(1).max(40).optional(),
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
       rating_min, rating_max, fen, turn, move_count,
       time_control_seconds, time_increment_seconds, white_time_ms, black_time_ms, last_move_at,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating)`
    )
    .eq("status", status)
    .eq("is_private", false)
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

  const limit = rateLimit(clientKey(req, session.user.id, "create-match"), {
    capacity: 5, refillPerSecond: 0.5,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitas partidas em pouco tempo. Aguarde." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { wager, preferredColor, ratingRange, timeControlSeconds, timeIncrementSeconds, isPrivate, challengedUsername } = parsed.data;

  let challengedUserId: string | null = null;
  if (challengedUsername) {
    const { data: target } = await supabase
      .from("chess_users")
      .select("id, banned_at")
      .ilike("username", challengedUsername)
      .single();
    if (!target) {
      return NextResponse.json({ error: `Usuário @${challengedUsername} não encontrado` }, { status: 404 });
    }
    if (target.banned_at) {
      return NextResponse.json({ error: "Este usuário está banido" }, { status: 400 });
    }
    if (target.id === session.user.id) {
      return NextResponse.json({ error: "Você não pode desafiar a si mesmo" }, { status: 400 });
    }
    challengedUserId = target.id;
  }

  const { data: userRow } = await supabase
    .from("chess_users")
    .select("rating, games_played, banned_at")
    .eq("id", session.user.id)
    .single();

  if (userRow?.banned_at) {
    return NextResponse.json({ error: "Sua conta está banida." }, { status: 403 });
  }

  if (wager > NOVICE_MAX_WAGER && (userRow?.games_played ?? 0) < NOVICE_MATCH_THRESHOLD) {
    return NextResponse.json(
      {
        error: `Novos jogadores só podem apostar até ${NOVICE_MAX_WAGER} coins nas primeiras ${NOVICE_MATCH_THRESHOLD} partidas.`,
        novice_limit: true,
      },
      { status: 400 }
    );
  }

  let ratingMin: number | null = null;
  let ratingMax: number | null = null;
  if (ratingRange && ratingRange !== "open" && userRow) {
    const spread = Number(ratingRange);
    ratingMin = userRow.rating - spread;
    ratingMax = userRow.rating + spread;
  }

  const { data, error } = await supabase.rpc("chess_create_match", {
    p_user_id:                session.user.id,
    p_wager:                  wager,
    p_color:                  preferredColor,
    p_rating_min:             ratingMin,
    p_rating_max:             ratingMax,
    p_time_control_seconds:   timeControlSeconds ?? null,
    p_time_increment_seconds: timeIncrementSeconds ?? 0,
    p_is_private:             isPrivate ?? false,
    p_challenged_user_id:     challengedUserId,
  });

  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, matchId: (data as { match_id: string }).match_id });
}
