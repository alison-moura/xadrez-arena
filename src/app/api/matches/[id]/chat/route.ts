import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  content: z.string().min(1).max(240),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Quem pode ler: jogadores da partida ou (depois de FINISHED) qualquer um.
  const { data: match } = await supabase
    .from("chess_matches")
    .select("white_user_id, black_user_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("chess_match_messages")
    .select("id, match_id, user_id, content, created_at, user:user_id(id, username)")
    .eq("match_id", params.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = rateLimit(clientKey(req, session.user.id, "chat"), {
    capacity: 5, refillPerSecond: 0.5,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Calma com o chat." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
  }

  const { error } = await supabase.rpc("chess_post_message", {
    p_user_id:  session.user.id,
    p_match_id: params.id,
    p_content:  parsed.data.content,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
