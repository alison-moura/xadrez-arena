import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type");        // ex.: "WAGER_WIN"
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10) || 50);

  let q = supabase
    .from("chess_transactions")
    .select("id, type, amount, balance_after, note, match_id, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (type) q = q.eq("type", type);

  const [{ data: wallet }, { data: transactions, count }] = await Promise.all([
    supabase
      .from("chess_wallets")
      .select("balance, locked, user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    q,
  ]);

  return NextResponse.json({
    wallet: wallet ?? { balance: 0, locked: 0 },
    transactions: transactions ?? [],
    total: count ?? 0,
    offset,
    limit,
  });
}
