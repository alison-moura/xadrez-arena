import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCoins, formatDate } from "@/lib/utils";
import { SKIN_DEFS } from "@/lib/skins";
import { FollowButton } from "./FollowButton";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const username = decodeURIComponent(params.username).replace(/^@/, "");
  const { data: user } = await supabase
    .from("chess_users")
    .select("id, username, rating, games_played, equipped_skin_id, banned_at, is_bot, is_admin, created_at")
    .eq("username", username)
    .maybeSingle();
  if (!user) notFound();

  // Stats agregadas (até 100 partidas finalizadas não-bot)
  const { data: matches } = await supabase
    .from("chess_matches")
    .select("id, result, winner_id, white_user_id, black_user_id, time_control_seconds, time_increment_seconds, payout, finished_at")
    .or(`white_user_id.eq.${user.id},black_user_id.eq.${user.id}`)
    .eq("status", "FINISHED")
    .is("bot_difficulty", null)
    .order("finished_at", { ascending: false })
    .limit(100);

  let wins = 0, losses = 0, draws = 0, totalWon = 0, longestStreak = 0, currentStreak = 0;
  for (const m of (matches ?? [])) {
    if (m.result?.includes("DRAW")) { draws++; currentStreak = 0; }
    else if (m.winner_id === user.id) { wins++; totalWon += m.payout ?? 0; currentStreak++; if (currentStreak > longestStreak) longestStreak = currentStreak; }
    else { losses++; currentStreak = 0; }
  }
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Conquistas
  const { data: achievements } = await supabase
    .from("chess_user_achievements")
    .select("earned_at, achievement:achievement_id(id, name, icon, reward_coins)")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false })
    .limit(50);

  const skin = SKIN_DEFS[user.equipped_skin_id ?? "classic"] ?? SKIN_DEFS.classic;
  const isMe = session.user.id === user.id;

  // Está seguindo?
  let alreadyFollowing = false;
  let followerCount = 0;
  if (!isMe) {
    const [{ data: rel }, { count }] = await Promise.all([
      supabase
        .from("chess_user_follows")
        .select("follower_id")
        .eq("follower_id", session.user.id)
        .eq("followed_id", user.id)
        .maybeSingle(),
      supabase
        .from("chess_user_follows")
        .select("*", { count: "exact", head: true })
        .eq("followed_id", user.id),
    ]);
    alreadyFollowing = !!rel;
    followerCount = count ?? 0;
  } else {
    const { count } = await supabase
      .from("chess_user_follows")
      .select("*", { count: "exact", head: true })
      .eq("followed_id", user.id);
    followerCount = count ?? 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/leaderboard" className="text-xs text-muted hover:text-white">← Ranking</Link>
      </div>

      {/* Hero */}
      <div className="card">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${skin.boardDark}, ${skin.boardLight})` }}
          >
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">@{user.username}</h1>
              {isMe && <span className="badge-accent text-[10px]">você</span>}
              {user.is_bot && <span className="badge text-[10px]">🤖 bot</span>}
              {user.is_admin && <span className="badge-accent text-[10px]">admin</span>}
              {user.banned_at && <span className="badge-danger text-[10px]">banido</span>}
            </div>
            <div className="mt-1 text-sm text-muted">
              Rating <strong className="text-white">{user.rating}</strong>
              {user.games_played < 10 && <span className="ml-1 text-accent">(provisional)</span>}
              {" · "}{user.games_played} partidas{" · "}desde {formatDate(user.created_at)}
            </div>
            <div className="mt-1 text-xs text-muted">
              👥 {followerCount} seguidor{followerCount !== 1 ? "es" : ""}
            </div>
          </div>
          {!isMe && !user.is_bot && (
            <FollowButton userId={user.id} initialFollowing={alreadyFollowing} />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatBox label="Vitórias"   value={wins.toString()}    tone="success" />
        <StatBox label="Empates"    value={draws.toString()}   tone="muted" />
        <StatBox label="Derrotas"   value={losses.toString()}  tone="danger" />
        <StatBox label="Win rate"   value={`${winRate}%`}      tone="accent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatBox label="Maior streak" value={`🔥 ${longestStreak}`} tone="accent" />
        <StatBox label="Streak atual" value={`🔥 ${currentStreak}`} tone="muted" />
        <StatBox label="Total ganho"  value={`${formatCoins(totalWon)} coins`} tone="accent" />
      </div>

      {/* Conquistas */}
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Conquistas <span className="text-white">({achievements?.length ?? 0})</span>
        </h2>
        {(!achievements || achievements.length === 0) ? (
          <p className="text-xs text-muted">Sem conquistas ainda.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((a, i) => {
              const ach = Array.isArray(a.achievement) ? a.achievement[0] : a.achievement;
              if (!ach) return null;
              return (
                <div key={i} className="flex items-center gap-2 rounded border border-border bg-surfaceAlt px-2 py-1.5">
                  <span className="text-xl">{ach.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{ach.name}</div>
                    <div className="text-[10px] text-muted">{formatDate(a.earned_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Últimas partidas */}
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Últimas partidas
        </h2>
        {(!matches || matches.length === 0) ? (
          <p className="text-xs text-muted">Sem partidas finalizadas.</p>
        ) : (
          <ul className="space-y-1">
            {matches.slice(0, 10).map((m) => {
              const isWhite = m.white_user_id === user.id;
              const won = m.winner_id === user.id;
              const draw = m.result?.includes("DRAW");
              return (
                <li key={m.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surfaceAlt text-xs">
                  <Link href={`/match/${m.id}`} className="flex-1 min-w-0">
                    <span className="text-muted">{isWhite ? "♔" : "♚"} </span>
                    <span className="text-muted">{formatDate(m.finished_at ?? "")}</span>
                  </Link>
                  {draw ? <span className="badge">empate</span>
                    : won ? <span className="badge-success">vitória +{formatCoins(m.payout ?? 0)}</span>
                          : <span className="badge-danger">derrota</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "muted" | "accent" }) {
  const colors: Record<string, string> = {
    success: "text-success",
    danger:  "text-danger",
    muted:   "text-white",
    accent:  "text-accent",
  };
  return (
    <div className="card py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${colors[tone]}`}>{value}</div>
    </div>
  );
}
