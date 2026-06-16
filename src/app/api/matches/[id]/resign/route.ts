import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeEscrow, payWinner } from "@/lib/wallet";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: params.id } });
      if (!match) throw new Error("Partida não encontrada");
      if (match.status !== "ACTIVE") throw new Error("Partida não está ativa");
      const userId = session.user.id;
      const isWhite = match.whiteUserId === userId;
      const isBlack = match.blackUserId === userId;
      if (!isWhite && !isBlack) throw new Error("Você não está nesta partida");

      const winnerId = isWhite ? match.blackUserId : match.whiteUserId;
      const matchResult = isWhite ? "WHITE_RESIGN" : "BLACK_RESIGN";
      const pot = match.wager * 2;
      const rake = Math.floor((pot * match.rakeBps) / 10000);
      const payout = pot - rake;

      if (match.wager > 0 && winnerId) {
        await consumeEscrow(tx, userId, match.wager, match.id);
        await payWinner(tx, winnerId, match.wager, payout, match.id);
      }

      const updated = await tx.match.update({
        where: { id: match.id },
        data: {
          status: "FINISHED",
          result: matchResult,
          winnerId: winnerId ?? undefined,
          payout,
          finishedAt: new Date(),
        },
      });
      return updated;
    });
    return NextResponse.json({ ok: true, match: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao desistir" },
      { status: 400 }
    );
  }
}
