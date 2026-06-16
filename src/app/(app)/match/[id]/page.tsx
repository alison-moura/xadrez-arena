import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { MatchClient } from "./MatchClient";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { data: match } = await supabase
    .from("chess_matches")
    .select(
      `*,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating),
       winner:winner_id(id, username)`
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!match) notFound();

  return <MatchClient initialMatch={match} viewerId={session.user.id} />;
}
