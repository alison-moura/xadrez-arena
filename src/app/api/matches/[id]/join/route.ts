import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockForWager } from "@/lib/wallet";

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
      if (match.status !== "WAITING") throw new Error("Partida não está aceitando jogadores");

      const userId = session.user.id;
      if (match.whiteUserId === userId || match.blackUserId === userId) {
        throw new Error("Você já está nesta partida");
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new Error("Carteira não encontrada");
      if (wallet.balance < match.wager) throw new Error("Saldo insuficiente");

      const updates: { whiteUserId?: string; blackUserId?: string } = {};
      if (match.whiteUserId === null) updates.whiteUserId = userId;
      else updates.blackUserId = userId;

      const updated = await tx.match.update({
        where: { id: match.id },
        data: {
          ...updates,
          status: "ACTIVE",
          startedAt: new Date(),
          pot: match.wager * 2,
        },
      });

      if (match.wager > 0) {
        await lockForWager(tx, userId, match.wager, match.id);
      }

      return updated;
    });
    return NextResponse.json({ ok: true, match: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao entrar" },
      { status: 400 }
    );
  }
}
