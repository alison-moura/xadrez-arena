import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const schema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  method: z.string().min(2).max(50),
  destination: z.string().min(3).max(200),
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
  const { data, error } = await supabase.rpc("chess_request_withdrawal", {
    p_user_id: session.user.id,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_destination: parsed.data.destination,
  });
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { data } = await supabase
    .from("chess_withdrawal_requests")
    .select("id, amount, method, destination, status, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ withdrawals: data ?? [] });
}
