import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { LobbyClient } from "./LobbyClient";
import { formatCoins } from "@/lib/utils";
import { DailyBonusBanner } from "@/components/DailyBonusBanner";
import { PuzzleCard } from "@/components/PuzzleCard";

export const dynamic = "force-dynamic";

function formatTC(sec: number, inc: number): string {
  return `${Math.round(sec / 60)}${inc > 0 ? `+${inc}` : ""}`;
}

export default async function LobbyPage() {
  const session = await auth();
  let viewerRating = 1200;
  let activeTournaments: Array<{
    id: string;
    name: string;
    ends_at: string;
    time_control_seconds: number;
    time_increment_seconds: number;
    prize_pool: number;
  }> = [];

  if (session?.user?.id) {
    const { data } = await supabase
      .from("chess_users")
      .select("rating")
      .eq("id", session.user.id)
      .single();
    viewerRating = data?.rating ?? 1200;

    // Torneios ACTIVE em que o user está inscrito
    const { data: registered } = await supabase
      .from("chess_tournament_players")
      .select("tournament_id")
      .eq("user_id", session.user.id);
    const ids = (registered ?? []).map((r) => r.tournament_id);
    if (ids.length) {
      const { data: tour } = await supabase
        .from("chess_tournaments")
        .select("id, name, ends_at, time_control_seconds, time_increment_seconds, prize_pool")
        .in("id", ids)
        .eq("status", "ACTIVE")
        .order("ends_at");
      activeTournaments = tour ?? [];
    }
  }

  return (
    <div className="space-y-4">
      <DailyBonusBanner />
      <PuzzleCard />
      {activeTournaments.length > 0 && (
        <div className="space-y-2">
          {activeTournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="card flex flex-wrap items-center justify-between gap-2 border-accent/40 hover:border-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔥</span>
                <div>
                  <div className="text-sm font-semibold">
                    {t.name} <span className="text-accent">— ao vivo</span>
                  </div>
                  <div className="text-[10px] text-muted">
                    Você está inscrito · ⏱ {formatTC(t.time_control_seconds, t.time_increment_seconds)} · prize {formatCoins(t.prize_pool)}
                  </div>
                </div>
              </div>
              <span className="badge-accent text-[10px]">jogar pra pontuar</span>
            </Link>
          ))}
        </div>
      )}
      <LobbyClient viewerRating={viewerRating} />
    </div>
  );
}
