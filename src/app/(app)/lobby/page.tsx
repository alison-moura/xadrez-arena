import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { LobbyClient } from "./LobbyClient";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const session = await auth();
  let viewerRating = 1200;
  if (session?.user?.id) {
    const { data } = await supabase
      .from("chess_users")
      .select("rating")
      .eq("id", session.user.id)
      .single();
    viewerRating = data?.rating ?? 1200;
  }
  return <LobbyClient viewerRating={viewerRating} />;
}
