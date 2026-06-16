import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import type { MatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const NOVICE_MATCH_THRESHOLD = 10;  // games_played threshold (ELO provisional period)
const NOVICE_MAX_WAGER       = 100;

const createSchema = z.object({
  wager:          z.number().int().min(0).max(1_000_000),
  preferredColor: z.enum(["w", "b", "random"]).default("random"),
  ratingRange:    z.enum(["100", "200", "500", "open"]).optional(),
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
      `id, wager, status, created_at, white_user_id, black_user_id, rating_min, rating_max,
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

  const { wager, preferredColor, ratingRange } = parsed.data;

  // Fetch user data once for all checks
  const { data: userRow } = await supabase
    .from("chess_users")
    .select("rating, games_played, banned_at")
    .eq("id", session.user.id)
    .single();

  if (userRow?.banned_at) {
    return NextResponse.json({ error: "Sua conta está banida." }, { status: 403 });
  }

  // Stake limit: players in provisional period (< 10 games) limited to 100 coins
  if (wager > NOVICE_MAX_WAGER && (userRow?.games_played ?? 0) < NOVICE_MATCH_THRESHOLD) {
    return NextResponse.json(
      {
        error: `Novos jogadores só podem apostar até ${NOVICE_MAX_WAGER} coins nas primeiras ${NOVICE_MATCH_THRESHOLD} partidas.`,
        novice_limit: true,
      },
      { status: 400 }
    );
  }

  // Compute rating range bounds
  let ratingMin: number | null = null;
  let ratingMax: number | null = null;

  if (ratingRange && ratingRange !== "open" && userRow) {
    const spread = Number(ratingRange);
    ratingMin = userRow.rating - spread;
    ratingMax = userRow.rating + spread;
  }

  const { data, error } = await supabase.rpc("chess_create_match", {
    p_user_id:   session.user.id,
    p_wager:     wager,
    p_color:     preferredColor,
    p_rating_min: ratingMin,
    p_rating_max: ratingMax,
  });

  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, matchId: (data as { match_id: string }).match_id });
}
