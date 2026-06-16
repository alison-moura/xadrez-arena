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
    const r = await sb.from("chess_users").select("id, username, rating").limit(5);
    return NextResponse.json({
      url: url.slice(0, 50),
      keyPrefix: key.slice(0, 30),
      keyLen: key.length,
      data: r.data,
      error: r.error,
    });
  } catch (e) {
    return NextResponse.json({
      err: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
    });
  }
}
