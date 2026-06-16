import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ urlSet: !!url, keySet: !!key });
  }

  try {
    const sb = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const r1 = await sb.from("chess_users").select("id, username, rating").limit(5);
    const r2 = await sb.from("chess_users").select("id, username, rating").order("rating", { ascending: false }).limit(20);
    // import singleton to test
    const { supabase: singleton } = await import("@/lib/supabase");
    const r3 = await singleton.from("chess_users").select("id, username, rating").order("rating", { ascending: false }).limit(20);
    return NextResponse.json({
      fresh_no_order: r1,
      fresh_with_order: r2,
      singleton_query: r3,
    });
  } catch (e) {
    return NextResponse.json({
      err: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
    });
  }
}
