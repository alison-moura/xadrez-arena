import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const { data: users } = await supabase
    .from("chess_users")
    .select("id, username, rating")
    .eq("is_bot", false)
    .order("rating", { ascending: false })
    .limit(50);

  const ids = (users ?? []).map((u) => u.id);
  const winCount = new Map<string, number>();
  if (ids.length) {
    const { data: wins } = await supabase
      .from("chess_matches")
      .select("winner_id")
      .in("winner_id", ids)
      .eq("status", "FINISHED");
    for (const w of wins ?? []) {
      if (w.winner_id) winCount.set(w.winner_id, (winCount.get(w.winner_id) ?? 0) + 1);
    }
  }

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
              <th className="px-4 py-3 text-right">Vitórias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((p, i) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-semibold text-muted">{i + 1}</td>
                <td className="px-4 py-3">@{p.username}</td>
                <td className="px-4 py-3 text-right font-mono">{p.rating}</td>
                <td className="px-4 py-3 text-right">{winCount.get(p.id) ?? 0}</td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Sem jogadores ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
