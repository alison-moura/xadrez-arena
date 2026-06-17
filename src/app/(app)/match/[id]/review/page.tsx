import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { data: match } = await supabase
    .from("chess_matches")
    .select(
      `id, pgn, fen, status, result, move_count, bot_difficulty,
       white_user_id, black_user_id, winner_id,
       white_avg_cpl, black_avg_cpl, white_accuracy, black_accuracy, move_cpls, analyzed_at,
       white_user:white_user_id(id, username, rating),
       black_user:black_user_id(id, username, rating),
       winner:winner_id(id, username)`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!match) notFound();

  // Supabase joins via FK retornam arrays; nosso ReviewClient espera o objeto único.
  // O cast desserializa o tipo gerado pelo cliente.
  return <ReviewClient match={match as unknown as Parameters<typeof ReviewClient>[0]["match"]} viewerId={session.user.id} />;
}
