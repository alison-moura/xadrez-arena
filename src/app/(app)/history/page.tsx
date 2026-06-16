import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCoins, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ whiteUserId: userId }, { blackUserId: userId }],
      status: { in: ["FINISHED", "CANCELLED"] },
    },
    include: {
      whiteUser: { select: { id: true, username: true } },
      blackUser: { select: { id: true, username: true } },
      winner: { select: { id: true, username: true } },
    },
    orderBy: { finishedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Histórico</h1>
      {matches.length === 0 ? (
        <div className="card text-center text-muted">
          Nenhuma partida finalizada ainda. Vá pro{" "}
          <Link href="/lobby" className="text-accent hover:underline">
            lobby
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => {
            const isWhite = m.whiteUserId === userId;
            const opp = isWhite ? m.blackUser : m.whiteUser;
            const won = m.winnerId === userId;
            const draw = m.result === "DRAW";
            const cancelled = m.status === "CANCELLED";
            return (
              <li key={m.id} className="card flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    <span className="text-muted">vs</span>{" "}
                    <span className="font-semibold">@{opp?.username}</span>{" "}
                    <span className="text-xs text-muted">
                      ({isWhite ? "Brancas" : "Pretas"})
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(m.finishedAt ?? m.createdAt)} • {m.moveCount} lances •
                    aposta {formatCoins(m.wager)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cancelled ? (
                    <span className="badge">Cancelada</span>
                  ) : draw ? (
                    <span className="badge">Empate</span>
                  ) : won ? (
                    <span className="badge-success">
                      Vitória +{formatCoins(m.payout)}
                    </span>
                  ) : (
                    <span className="badge-danger">
                      Derrota -{formatCoins(m.wager)}
                    </span>
                  )}
                  <Link href={`/match/${m.id}`} className="text-sm text-accent hover:underline">
                    rever
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
