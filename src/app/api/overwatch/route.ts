import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Eligible reviewer: rating >= 1500 OR games_played >= 50
const ELIGIBILITY_RATING = 1500;
const ELIGIBILITY_GAMES  = 50;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Check reviewer eligibility
  const { data: viewer } = await supabase
    .from("chess_users")
    .select("rating, games_played, banned_at")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!viewer || viewer.banned_at) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const isEligible =
    viewer.rating >= ELIGIBILITY_RATING || viewer.games_played >= ELIGIBILITY_GAMES;

  if (!isEligible) {
    return NextResponse.json({
      eligible: false,
      reason: `Requer rating ≥ ${ELIGIBILITY_RATING} ou ${ELIGIBILITY_GAMES}+ partidas.`,
      cases: [],
    });
  }

  // Fetch OPEN cases the viewer hasn't voted on yet
  const { data: cases } = await supabase
    .from("chess_overwatch_cases")
    .select(`
      id,
      accused_id,
      match_id,
      status,
      votes_needed,
      created_at,
      accused:accused_id(id, username, rating, games_played),
      match:match_id(id, pgn, move_count, result, finished_at,
        white_user:white_user_id(id, username, rating),
        black_user:black_user_id(id, username, rating)
      )
    `)
    .eq("status", "OPEN")
    .order("created_at", { ascending: true })
    .limit(20);

  if (!cases) {
    return NextResponse.json({ eligible: true, cases: [] });
  }

  // Fetch votes by this viewer for these cases
  const caseIds = cases.map((c) => c.id);
  const { data: myVotes } = caseIds.length
    ? await supabase
        .from("chess_overwatch_votes")
        .select("case_id, vote")
        .eq("voter_id", session.user.id)
        .in("case_id", caseIds)
    : { data: [] };

  const votedMap = new Map((myVotes ?? []).map((v) => [v.case_id, v.vote]));

  // Fetch vote counts per case
  const { data: voteCounts } = caseIds.length
    ? await supabase
        .from("chess_overwatch_votes")
        .select("case_id, vote")
        .in("case_id", caseIds)
    : { data: [] };

  const countMap = new Map<string, { CLEAN: number; CHEATER: number }>();
  for (const v of voteCounts ?? []) {
    const existing = countMap.get(v.case_id) ?? { CLEAN: 0, CHEATER: 0 };
    existing[v.vote as "CLEAN" | "CHEATER"]++;
    countMap.set(v.case_id, existing);
  }

  const enriched = cases.map((c) => ({
    ...c,
    my_vote:      votedMap.get(c.id) ?? null,
    vote_counts:  countMap.get(c.id) ?? { CLEAN: 0, CHEATER: 0 },
  }));

  return NextResponse.json({ eligible: true, cases: enriched });
}
