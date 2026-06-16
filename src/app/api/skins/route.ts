import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [packsResult, inventoryResult, userResult] = await Promise.all([
    supabase.from("chess_skin_packs").select("*").order("sort_order"),
    supabase.from("chess_user_skins")
      .select("*, skin_pack:skin_pack_id(*)")
      .eq("user_id", session.user.id)
      .order("acquired_at", { ascending: false }),
    supabase.from("chess_users").select("equipped_skin_id").eq("id", session.user.id).single(),
  ]);

  return NextResponse.json({
    packs: packsResult.data ?? [],
    inventory: inventoryResult.data ?? [],
    equippedSkinId: userResult.data?.equipped_skin_id ?? "classic",
  });
}
