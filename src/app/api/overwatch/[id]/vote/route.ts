import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

const schema = z.object({
  vote: z.enum(["CLEAN", "CHEATER"]),
});

const ELIGIBILITY_RATING = 1500;
const ELIGIBILITY_GAMES  = 50;
const AUTO_RESOLVE_VOTES = 5;   // resolve after 5 votes on either side with majority

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Voto inválido" }, { status: 400 });
  }

  // Check eligibility
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
    return NextResponse.json({ error: "Você não é elegível para revisar casos" }, { status: 403 });
  }

  // Fetch the case
  const { data: owCase } = await supabase
    .from("chess_overwatch_cases")
    .select("id, status, accused_id, votes_needed")
    .eq("id", params.id)
    .maybeSingle();

  if (!owCase) {
    return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
  }
  if (owCase.status !== "OPEN") {
    return NextResponse.json({ error: "Este caso já foi resolvido" }, { status: 409 });
  }
  if (owCase.accused_id === session.user.id) {
    return NextResponse.json({ error: "Você não pode votar no seu próprio caso" }, { status: 403 });
  }

  // Insert vote (UNIQUE prevents double-voting)
  const { error: voteErr } = await supabase.from("chess_overwatch_votes").insert({
    case_id:  params.id,
    voter_id: session.user.id,
    vote:     parsed.data.vote,
  });

  if (voteErr) {
    if (voteErr.code === "23505") {
      return NextResponse.json({ error: "Você já votou neste caso" }, { status: 409 });
    }
    return NextResponse.json({ error: rpcError(voteErr) }, { status: 400 });
  }

  // Check if auto-resolve threshold reached
  const { data: votes } = await supabase
    .from("chess_overwatch_votes")
    .select("vote")
    .eq("case_id", params.id);

  const counts = { CLEAN: 0, CHEATER: 0 };
  for (const v of votes ?? []) {
    counts[v.vote as "CLEAN" | "CHEATER"]++;
  }

  const totalVotes = counts.CLEAN + counts.CHEATER;
  if (totalVotes >= AUTO_RESOLVE_VOTES) {
    const verdict = counts.CHEATER > counts.CLEAN ? "CHEATER" : "CLEAN";
    await supabase.rpc("chess_resolve_overwatch_case", {
      p_case_id: params.id,
      p_verdict: verdict,
    });

    // Check Árbitro achievement for all voters who voted correctly
    const { data: correctVoters } = await supabase
      .from("chess_overwatch_votes")
      .select("voter_id")
      .eq("case_id", params.id)
      .eq("vote", verdict);

    for (const voter of correctVoters ?? []) {
      // Count correct votes by this user across all resolved cases
      const { count } = await supabase
        .from("chess_overwatch_votes")
        .select("id", { count: "exact", head: true })
        .eq("voter_id", voter.voter_id);

      if ((count ?? 0) >= 10) {
        await supabase.rpc("chess_grant_achievement", {
          p_user_id:        voter.voter_id,
          p_achievement_id: "arbitro",
        });
      }
    }

    return NextResponse.json({ ok: true, resolved: true, verdict });
  }

  return NextResponse.json({ ok: true, resolved: false, counts });
}
