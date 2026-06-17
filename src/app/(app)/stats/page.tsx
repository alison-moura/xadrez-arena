import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCoins } from "@/lib/utils";
import { Sparkline } from "@/components/Sparkline";

export const dynamic = "force-dynamic";

type TCBucket = "bullet" | "blitz" | "rapid" | "classical" | "untimed";
const TC_LABELS: Record<TCBucket, string> = {
  bullet:    "⚡ Bullet",
  blitz:     "🔥 Blitz",
  rapid:     "🏃 Rápido",
  classical: "🐢 Clássico",
  untimed:   "∞ Sem tempo",
};

function bucketOf(sec: number | null): TCBucket {
  if (sec === null || sec === undefined) return "untimed";
  if (sec <= 120) return "bullet";
  if (sec <= 300) return "blitz";
  if (sec <= 1800) return "rapid";
  return "classical";
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { data: me } = await supabase
    .from("chess_users")
    .select("rating, username, games_played")
    .eq("id", userId)
    .maybeSingle();

  const { data: matches } = await supabase
    .from("chess_matches")
    .select("id, result, winner_id, white_user_id, black_user_id, time_control_seconds, time_increment_seconds, payout, wager, finished_at, move_count, white_rating_delta, black_rating_delta, bot_difficulty")
    .or(`white_user_id.eq.${userId},black_user_id.eq.${userId}`)
    .eq("status", "FINISHED")
    .order("finished_at", { ascending: false })
    .limit(500);

  const all = matches ?? [];
  const human = all.filter((m) => m.bot_difficulty === null);
  const vsBot = all.filter((m) => m.bot_difficulty !== null);

  // Por bucket de tempo
  const buckets: TCBucket[] = ["bullet", "blitz", "rapid", "classical", "untimed"];
  const byBucket: Record<TCBucket, { w: number; l: number; d: number; total: number; delta: number }> = {
    bullet: { w: 0, l: 0, d: 0, total: 0, delta: 0 },
    blitz: { w: 0, l: 0, d: 0, total: 0, delta: 0 },
    rapid: { w: 0, l: 0, d: 0, total: 0, delta: 0 },
    classical: { w: 0, l: 0, d: 0, total: 0, delta: 0 },
    untimed: { w: 0, l: 0, d: 0, total: 0, delta: 0 },
  };
  for (const m of human) {
    const b = bucketOf(m.time_control_seconds);
    const bk = byBucket[b];
    bk.total++;
    const delta = m.white_user_id === userId ? m.white_rating_delta : m.black_rating_delta;
    bk.delta += delta ?? 0;
    if (m.result?.includes("DRAW")) bk.d++;
    else if (m.winner_id === userId) bk.w++;
    else bk.l++;
  }

  // Totais humanos
  const totalH = human.length;
  let winsH = 0, drawsH = 0, lossesH = 0, totalWonH = 0, totalLostH = 0;
  for (const m of human) {
    if (m.result?.includes("DRAW")) drawsH++;
    else if (m.winner_id === userId) { winsH++; totalWonH += m.payout ?? 0; }
    else { lossesH++; totalLostH += m.wager ?? 0; }
  }
  const winRateH = totalH > 0 ? Math.round((winsH / totalH) * 100) : 0;
  const netCoins = totalWonH - totalLostH;

  // Streak atual (no histórico humano)
  let currentStreak = 0;
  for (const m of human) {
    if (m.result?.includes("DRAW")) break;
    if (m.winner_id === userId) currentStreak++;
    else break;
  }

  // Trajetória de rating (últimas 60 partidas)
  let r = me?.rating ?? 1200;
  const reverseTraj: number[] = [r];
  for (const m of human.slice(0, 60)) {
    const delta = m.white_user_id === userId ? m.white_rating_delta : m.black_rating_delta;
    r -= delta ?? 0;
    reverseTraj.push(r);
  }
  const traj = reverseTraj.slice().reverse();

  // Atividade nos últimos 14 dias
  const now = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: 0 });
  }
  for (const m of human) {
    if (!m.finished_at) continue;
    const key = new Date(m.finished_at).toISOString().slice(0, 10);
    const slot = days.find((x) => x.date === key);
    if (slot) slot.count++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  // vs bot stats
  const botWins = vsBot.filter((m) => m.winner_id === userId).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">📊 Estatísticas</h1>
          <p className="text-xs text-muted">@{me?.username} · Rating <strong className="text-white">{me?.rating}</strong></p>
        </div>
        <Link href={`/u/${me?.username}`} className="btn-secondary text-xs">Perfil público →</Link>
      </div>

      {/* Big numbers */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Big label="Total" value={totalH.toString()} sub="contra humanos" />
        <Big label="Win rate" value={`${winRateH}%`} tone={winRateH >= 50 ? "success" : "muted"} />
        <Big label="Streak" value={currentStreak.toString()} suffix={currentStreak > 0 ? "🔥" : undefined} />
        <Big label="Saldo total" value={formatCoins(netCoins)} tone={netCoins >= 0 ? "success" : "danger"} />
      </div>

      {/* Por categoria de tempo */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Por categoria de tempo</h2>
        {totalH === 0 ? (
          <p className="text-xs text-muted">Sem partidas contra humanos ainda.</p>
        ) : (
          <ul className="space-y-2">
            {buckets.map((b) => {
              const data = byBucket[b];
              if (data.total === 0) return null;
              const wr = Math.round((data.w / data.total) * 100);
              return (
                <li key={b} className="grid grid-cols-[140px_60px_1fr_60px] items-center gap-3 text-xs">
                  <span className="font-medium">{TC_LABELS[b]}</span>
                  <span className="text-muted">{data.total} jogos</span>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-surfaceAlt text-[9px] font-medium">
                    {data.w > 0 && (
                      <div className="flex items-center justify-center bg-success/80 text-black" style={{ width: `${(data.w / data.total) * 100}%` }}>
                        {data.w > 1 ? data.w : ""}
                      </div>
                    )}
                    {data.d > 0 && (
                      <div className="flex items-center justify-center bg-muted/30 text-white" style={{ width: `${(data.d / data.total) * 100}%` }}>
                        {data.d > 1 ? data.d : ""}
                      </div>
                    )}
                    {data.l > 0 && (
                      <div className="flex items-center justify-center bg-danger/70 text-black" style={{ width: `${(data.l / data.total) * 100}%` }}>
                        {data.l > 1 ? data.l : ""}
                      </div>
                    )}
                  </div>
                  <span className="text-right text-muted">
                    <span className={wr >= 50 ? "text-success" : "text-danger"}>{wr}%</span>
                    {data.delta !== 0 && (
                      <span className={`ml-1 ${data.delta > 0 ? "text-success" : "text-danger"}`}>
                        ({data.delta > 0 ? "+" : ""}{data.delta})
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Trajetória */}
      {traj.length > 1 && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Trajetória de rating (últimas {traj.length - 1} partidas)</h2>
          <Sparkline values={traj} />
        </div>
      )}

      {/* Atividade */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Atividade nos últimos 14 dias</h2>
        <div className="flex items-end gap-1 h-24">
          {days.map((d) => {
            const h = Math.round((d.count / maxDay) * 100);
            const isToday = d.date === now.toISOString().slice(0, 10);
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className={`w-full rounded-sm transition-colors ${d.count > 0 ? (isToday ? "bg-accent" : "bg-accent/60") : "bg-surfaceAlt"}`}
                  style={{ height: `${Math.max(2, h)}%`, minHeight: 2 }}
                  title={`${d.date}: ${d.count} partida${d.count === 1 ? "" : "s"}`}
                />
                <span className={`text-[9px] ${isToday ? "text-accent font-medium" : "text-muted"}`}>
                  {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted">Total: {days.reduce((s, d) => s + d.count, 0)} partidas · Pico: {maxDay} num único dia</p>
      </div>

      {/* Bots */}
      {vsBot.length > 0 && (
        <div className="card grid grid-cols-3 gap-2 text-center">
          <Big small label="vs Bot" value={vsBot.length.toString()} />
          <Big small label="Vitórias vs Bot" value={botWins.toString()} tone="success" />
          <Big small label="Win rate vs Bot" value={`${Math.round((botWins / vsBot.length) * 100)}%`} />
        </div>
      )}
    </div>
  );
}

function Big({ label, value, sub, tone, suffix, small }: {
  label: string; value: string; sub?: string; suffix?: string;
  tone?: "success" | "danger" | "muted"; small?: boolean;
}) {
  const c = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div className={small ? "" : "card py-3"}>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 font-bold ${c} ${small ? "text-lg" : "text-xl"}`}>
        {value}{suffix && <span className="ml-1 text-base">{suffix}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
