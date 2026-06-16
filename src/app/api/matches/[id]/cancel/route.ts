import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refundFromEscrow } from "@/lib/wallet";

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
      if (match.status !== "WAITING") throw new Error("Só é possível cancelar antes de iniciar");
      if (match.creatorId !== session.user.id) throw new Error("Apenas o criador pode cancelar");
      if (match.wager > 0) {
        await refundFromEscrow(
          tx,
          match.creatorId,
          match.wager,
          match.id,
          "WAGER_REFUND",
          "Partida cancelada"
        );
      }
      return tx.match.update({
        where: { id: match.id },
        data: { status: "CANCELLED" },
      });
    });
    return NextResponse.json({ ok: true, match: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 400 }
    );
  }
}
