import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PROVISIONAL_THRESHOLD = 10;

type Category = "geral" | "bullet" | "blitz" | "rapid";

const CATEGORIES: { value: Category; label: string; emoji: string; ratingCol: string; gamesCol: string; desc: string }[] = [
  { value: "geral",  label: "Geral",  emoji: "🏅", ratingCol: "rating",        gamesCol: "games_played", desc: "Todas as partidas rankeadas" },
  { value: "bullet", label: "Bullet", emoji: "🚀", ratingCol: "rating_bullet", gamesCol: "games_bullet", desc: "Até 2 minutos" },
  { value: "blitz",  label: "Blitz",  emoji: "⚡", ratingCol: "rating_blitz",  gamesCol: "games_blitz",  desc: "Até 5 minutos" },
  { value: "rapid",  label: "Rápido", emoji: "⏱️", ratingCol: "rating_rapid",  gamesCol: "games_rapid",  desc: "Acima de 5 minutos" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: { cat?: string };
}) {
  const session = await auth();
  const cat = CATEGORIES.find((c) => c.value === searchParams?.cat) ?? CATEGORIES[0];

  const { data: users } = await supabase
    .from("chess_users")
    .select(`id, username, banned_at, rating:${cat.ratingCol}, games:${cat.gamesCol}`)
    .eq("is_bot", false)
    .is("banned_at", null)
    .order(cat.ratingCol, { ascending: false })
    .limit(50);

  type Row = { id: string; username: string; rating: number; games: number };
  // Em categorias específicas, esconde quem nunca jogou nela
  const rows = ((users ?? []) as unknown as Row[]).filter(
    (u) => cat.value === "geral" || (u.games ?? 0) > 0
  );

  const ids = rows.map((u) => u.id);
  const winCount = new Map<string, number>();
  if (ids.length) {
    const { data: wins } = await supabase
      .from("chess_matches")
      .select("winner_id")
      .in("winner_id", ids)
      .eq("status", "FINISHED")
      .is("bot_difficulty", null);
    for (const w of wins ?? []) {
      if (w.winner_id) winCount.set(w.winner_id, (winCount.get(w.winner_id) ?? 0) + 1);
    }
  }

  const viewerId = session?.user?.id;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Ranking</h1>
          <p className="text-xs text-muted">{cat.desc}</p>
        </div>
        <div className="flex gap-1.5">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={c.value === "geral" ? "/leaderboard" : `/leaderboard?cat=${c.value}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                cat.value === c.value
                  ? "border-accent bg-accent font-semibold text-black"
                  : "border-border text-muted hover:border-accent/40 hover:text-white"
              }`}
            >
              {c.emoji} {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-surfaceAlt text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Jogador</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">Partidas</th>
              <th className="px-4 py-3 text-right">Vitórias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p, i) => {
              const isProvisional = (p.games ?? 0) < PROVISIONAL_THRESHOLD;
              const isMe = p.id === viewerId;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <tr key={p.id} className={isMe ? "bg-accent/5" : ""}>
                  <td className="px-4 py-3 font-semibold text-muted">{medal ?? i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/u/${encodeURIComponent(p.username)}`}
                      className={isMe ? "font-semibold text-accent hover:underline" : "hover:text-accent"}
                    >
                      @{p.username}
                    </Link>
                    {isMe && <span className="ml-1 text-xs text-muted">(você)</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {isProvisional ? (
                      <span className="text-muted">
                        {p.rating}
                        <span className="ml-0.5 text-xs text-accent">?</span>
                      </span>
                    ) : (
                      p.rating
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{p.games ?? 0}</td>
                  <td className="px-4 py-3 text-right">{winCount.get(p.id) ?? 0}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  {cat.value === "geral"
                    ? "Sem jogadores ainda."
                    : `Ninguém jogou partidas de ${cat.label} ainda. Seja o primeiro!`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        <span className="text-accent">?</span> = provisório (menos de {PROVISIONAL_THRESHOLD} partidas
        {cat.value !== "geral" ? " na categoria" : ""})
      </p>
    </div>
  );
}
