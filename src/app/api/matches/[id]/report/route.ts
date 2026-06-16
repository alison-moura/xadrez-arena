import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

const schema = z.object({
  reason: z.enum(["cheating", "stalling", "abuse", "other"]),
  details: z.string().max(500).optional(),
});

const REASON_LABELS: Record<string, string> = {
  cheating: "Uso de engine/bot",
  stalling: "Jogo lento intencional",
  abuse:    "Comportamento abusivo",
  other:    "Outro",
};

const OVERWATCH_ELIGIBILITY_RATING   = 1500;
const OVERWATCH_ELIGIBILITY_GAMES    = 50;
const OVERWATCH_TRIGGER_REPORTS      = 3;

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
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Fetch the match
  const { data: match } = await supabase
    .from("chess_matches")
    .select("id, status, white_user_id, black_user_id, bot_difficulty")
    .eq("id", params.id)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "FINISHED") {
    return NextResponse.json({ error: "Só é possível denunciar após o fim da partida" }, { status: 400 });
  }
  if (match.bot_difficulty) {
    return NextResponse.json({ error: "Não é possível denunciar partidas contra o bot" }, { status: 400 });
  }

  const reporterId = session.user.id;
  const isWhite = match.white_user_id === reporterId;
  const isBlack = match.black_user_id === reporterId;
  if (!isWhite && !isBlack) {
    return NextResponse.json({ error: "Você não participou desta partida" }, { status: 403 });
  }

  const accusedId = isWhite ? match.black_user_id : match.white_user_id;
  if (!accusedId) {
    return NextResponse.json({ error: "Oponente não encontrado" }, { status: 400 });
  }

  // Insert report (UNIQUE constraint prevents double-reporting)
  const { error: reportErr } = await supabase.from("chess_reports").insert({
    reporter_id: reporterId,
    accused_id:  accusedId,
    match_id:    params.id,
    reason:      REASON_LABELS[parsed.data.reason] ?? parsed.data.reason,
    details:     parsed.data.details ?? null,
  });

  if (reportErr) {
    if (reportErr.code === "23505") {
      return NextResponse.json({ error: "Você já denunciou esta partida" }, { status: 409 });
    }
    return NextResponse.json({ error: rpcError(reportErr) }, { status: 400 });
  }

  // Check if this match has enough reports to create an Overwatch case
  const { count: reportCount } = await supabase
    .from("chess_reports")
    .select("id", { count: "exact", head: true })
    .eq("match_id", params.id)
    .eq("accused_id", accusedId);

  const hasCase = await supabase
    .from("chess_overwatch_cases")
    .select("id", { head: true })
    .eq("match_id", params.id)
    .eq("accused_id", accusedId)
    .maybeSingle();

  if (
    (reportCount ?? 0) >= OVERWATCH_TRIGGER_REPORTS &&
    !hasCase.data
  ) {
    await supabase.from("chess_overwatch_cases").insert({
      accused_id:   accusedId,
      match_id:     params.id,
      votes_needed: 5,
    });
  }

  return NextResponse.json({ ok: true });
}
