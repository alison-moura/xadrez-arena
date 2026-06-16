import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const players = await prisma.user.findMany({
    orderBy: { rating: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      rating: true,
      _count: { select: { matchesWon: true } },
    },
  });

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
            {players.map((p, i) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-semibold text-muted">{i + 1}</td>
                <td className="px-4 py-3">@{p.username}</td>
                <td className="px-4 py-3 text-right font-mono">{p.rating}</td>
                <td className="px-4 py-3 text-right">{p._count.matchesWon}</td>
              </tr>
            ))}
            {players.length === 0 && (
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
