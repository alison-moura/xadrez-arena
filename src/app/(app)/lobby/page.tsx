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

  let todayRecord: { w: number; l: number; d: number; delta: number } | null = null;

  if (session?.user?.id) {
    const { data } = await supabase
      .from("chess_users")
      .select("rating")
      .eq("id", session.user.id)
      .single();
    viewerRating = data?.rating ?? 1200;

    // Record de hoje (partidas finalizadas desde 00:00 local — usamos UTC pra simplificar)
    const startOfDayUTC = new Date();
    startOfDayUTC.setUTCHours(0, 0, 0, 0);
    const { data: today } = await supabase
      .from("chess_matches")
      .select("result, winner_id, white_user_id, black_user_id, white_rating_delta, black_rating_delta")
      .or(`white_user_id.eq.${session.user.id},black_user_id.eq.${session.user.id}`)
      .eq("status", "FINISHED")
      .is("bot_difficulty", null)
      .gte("finished_at", startOfDayUTC.toISOString());
    if (today && today.length > 0) {
      let w = 0, l = 0, d = 0, delta = 0;
      for (const m of today) {
        if (m.result?.includes("DRAW")) d++;
        else if (m.winner_id === session.user.id) w++;
        else l++;
        const dd = m.white_user_id === session.user.id ? m.white_rating_delta : m.black_rating_delta;
        delta += dd ?? 0;
      }
      todayRecord = { w, l, d, delta };
    }

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
      {todayRecord && (
        <Link
          href="/stats"
          className="card flex items-center justify-between border-accent/30 transition-colors hover:border-accent/60"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <div className="text-sm font-semibold">Hoje</div>
              <div className="text-[11px] text-muted">
                <span className="text-success">{todayRecord.w}V</span>
                {todayRecord.d > 0 && <> · <span>{todayRecord.d}E</span></>}
                {todayRecord.l > 0 && <> · <span className="text-danger">{todayRecord.l}D</span></>}
                {" · rating "}
                <span className={todayRecord.delta > 0 ? "text-success" : todayRecord.delta < 0 ? "text-danger" : ""}>
                  {todayRecord.delta > 0 ? "+" : ""}{todayRecord.delta}
                </span>
              </div>
            </div>
          </div>
          <span className="badge text-[10px]">/stats →</span>
        </Link>
      )}
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
