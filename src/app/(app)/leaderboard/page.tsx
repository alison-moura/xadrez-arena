import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PROVISIONAL_THRESHOLD = 10;

export default async function LeaderboardPage() {
  const session = await auth();

  const { data: users } = await supabase
    .from("chess_users")
    .select("id, username, rating, games_played, banned_at")
    .eq("is_bot", false)
    .is("banned_at", null)
    .order("rating", { ascending: false })
    .limit(50);

  const ids = (users ?? []).map((u) => u.id);
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
      <h1 className="mb-4 text-2xl font-semibold">Ranking</h1>
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
            {(users ?? []).map((p, i) => {
              const isProvisional = (p.games_played ?? 0) < PROVISIONAL_THRESHOLD;
              const isMe = p.id === viewerId;
              return (
                <tr key={p.id} className={isMe ? "bg-accent/5" : ""}>
                  <td className="px-4 py-3 font-semibold text-muted">{i + 1}</td>
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
                  <td className="px-4 py-3 text-right text-muted">{p.games_played ?? 0}</td>
                  <td className="px-4 py-3 text-right">{winCount.get(p.id) ?? 0}</td>
                </tr>
              );
            })}
            {(!users || users.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Sem jogadores ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        <span className="text-accent">?</span> = provisório (menos de {PROVISIONAL_THRESHOLD} partidas)
      </p>
    </div>
  );
}
