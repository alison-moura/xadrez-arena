import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// Recebe análise computada no client (Stockfish WASM) e persiste no banco
// pra que futuras visitas mostrem o resultado direto sem recomputar.
const schema = z.object({
  whiteAvgCpl:   z.number().min(0).max(5000),
  blackAvgCpl:   z.number().min(0).max(5000),
  whiteAccuracy: z.number().min(0).max(100),
  blackAccuracy: z.number().min(0).max(100),
  moveCpls:      z.array(z.number().min(0).max(50000)).max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "analysis-persist"), {
    capacity: 5, refillPerSecond: 0.1,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitas análises seguidas." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { data: match } = await supabase
    .from("chess_matches")
    .select("status, white_user_id, black_user_id, bot_difficulty")
    .eq("id", params.id)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }
  if (match.status !== "FINISHED") {
    return NextResponse.json({ error: "Partida não finalizada" }, { status: 400 });
  }
  if (match.bot_difficulty) {
    return NextResponse.json({ error: "Análise não persiste pra bot" }, { status: 400 });
  }
  if (match.white_user_id !== session.user.id && match.black_user_id !== session.user.id) {
    return NextResponse.json({ error: "Você não jogou nessa partida" }, { status: 403 });
  }

  await supabase
    .from("chess_matches")
    .update({
      white_avg_cpl:  parsed.data.whiteAvgCpl,
      black_avg_cpl:  parsed.data.blackAvgCpl,
      white_accuracy: parsed.data.whiteAccuracy,
      black_accuracy: parsed.data.blackAccuracy,
      move_cpls:      parsed.data.moveCpls ?? null,
      analyzed_at:    new Date().toISOString(),
    })
    .eq("id", params.id);

  return NextResponse.json({ ok: true });
}
