import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";

const schema = z.object({
  action: z.enum(["approve", "reject", "paid"]),
  note:   z.string().max(240).optional(),
});

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
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const fn = parsed.data.action === "approve"
    ? "chess_approve_withdrawal"
    : parsed.data.action === "reject"
      ? "chess_reject_withdrawal"
      : "chess_mark_withdrawal_paid";

  const args: Record<string, unknown> = {
    p_admin_id:      session.user.id,
    p_withdrawal_id: params.id,
  };
  if (parsed.data.action === "reject") args.p_note = parsed.data.note ?? null;

  const { error } = await supabase.rpc(fn, args);
  if (error) {
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
