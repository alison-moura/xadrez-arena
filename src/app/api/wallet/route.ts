import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const [{ data: wallet }, { data: transactions }] = await Promise.all([
    supabase
      .from("chess_wallets")
      .select("balance, locked, user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("chess_transactions")
      .select("id, type, amount, balance_after, note, match_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    wallet: wallet ?? { balance: 0, locked: 0 },
    transactions: transactions ?? [],
  });
}
