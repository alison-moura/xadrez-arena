import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCoins, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  wager: number;
  status: string;
  result: string | null;
  winner_id: string | null;
  payout: number;
  move_count: number;
  white_user_id: string | null;
  black_user_id: string | null;
  finished_at: string | null;
  created_at: string;
  white_user: { id: string; username: string } | null;
  black_user: { id: string; username: string } | null;
};

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const { data } = await supabase
    .from("chess_matches")
    .select(
      `id, wager, status, result, winner_id, payout, move_count, white_user_id, black_user_id,
       finished_at, created_at,
       white_user:white_user_id(id, username),
       black_user:black_user_id(id, username)`
    )
    .or(`white_user_id.eq.${userId},black_user_id.eq.${userId}`)
    .in("status", ["FINISHED", "CANCELLED"])
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const matches = (data ?? []) as unknown as Row[];

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
            const isWhite = m.white_user_id === userId;
            const opp = isWhite ? m.black_user : m.white_user;
            const won = m.winner_id === userId;
            const draw = m.result === "DRAW";
            const cancelled = m.status === "CANCELLED";
            return (
              <li key={m.id} className="card flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    <span className="text-muted">vs</span>{" "}
                    <span className="font-semibold">@{opp?.username ?? "?"}</span>{" "}
                    <span className="text-xs text-muted">
                      ({isWhite ? "Brancas" : "Pretas"})
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(m.finished_at ?? m.created_at)} • {m.move_count} lances •
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
