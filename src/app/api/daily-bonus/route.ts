import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase, rpcError } from "@/lib/supabase";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { data } = await supabase
    .from("chess_users")
    .select("last_daily_bonus_at, daily_streak")
    .eq("id", session.user.id)
    .maybeSingle();

  const lastClaim = data?.last_daily_bonus_at ? new Date(data.last_daily_bonus_at) : null;
  const todayUTC  = new Date(); todayUTC.setUTCHours(0,0,0,0);
  const canClaim  = !lastClaim || lastClaim < todayUTC;
  return NextResponse.json({
    canClaim,
    streak:     data?.daily_streak ?? 0,
    lastClaim:  data?.last_daily_bonus_at,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const limit = rateLimit(clientKey(req, session.user.id, "daily-bonus"), {
    capacity: 2, refillPerSecond: 0.05,
  });
  if (!limit.ok) return NextResponse.json({ error: "Aguarde." }, { status: 429 });

  const { data, error } = await supabase.rpc("chess_claim_daily_bonus", {
    p_user_id: session.user.id,
  });
  if (error) return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  return NextResponse.json({ ok: true, ...(data as object) });
}
