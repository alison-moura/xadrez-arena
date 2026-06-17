import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("chess_users")
    .select("is_admin")
    .eq("id", session.user.id)
    .maybeSingle();
  if (!me?.is_admin) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") ?? "PENDING") as
    "PENDING" | "APPROVED" | "REJECTED" | "PAID";

  const { data, error } = await supabase
    .from("chess_withdrawal_requests")
    .select("id, user_id, amount, method, destination, status, note, created_at, updated_at, user:user_id(id, username, email)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ withdrawals: data ?? [] });
}
