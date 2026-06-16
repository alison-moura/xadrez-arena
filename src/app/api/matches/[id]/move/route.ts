import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyMove } from "@/lib/chess-engine";
import { consumeEscrow, payWinner, refundFromEscrow } from "@/lib/wallet";
import type { MatchResult, MatchStatus } from "@prisma/client";

const schema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.string().length(1).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lance inválido" }, { status: 400 });
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

      const myColor = isWhite ? "w" : "b";
      if (match.turn !== myColor) throw new Error("Não é sua vez de jogar");

      const moveRes = applyMove(match.fen, match.pgn, parsed.data);
      if (!moveRes) throw new Error("Lance ilegal");

      const newPly = match.moveCount + 1;

      await tx.move.create({
        data: {
          matchId: match.id,
          ply: newPly,
          san: moveRes.san,
          uci: moveRes.uci,
          fenAfter: moveRes.fen,
          byUserId: userId,
        },
      });

      let status: MatchStatus = match.status;
      let matchResult: MatchResult | null = null;
      let winnerId: string | null = null;
      let finishedAt: Date | null = null;
      let payout = 0;

      if (moveRes.isGameOver) {
        status = "FINISHED";
        finishedAt = new Date();
        if (moveRes.isCheckmate) {
          // a vez do oponente foi quem levou mate -> quem jogou venceu
          winnerId = userId;
          matchResult = isWhite ? "WHITE_WIN" : "BLACK_WIN";
        } else {
          matchResult = "DRAW";
        }

        if (matchResult === "DRAW") {
          // devolve aposta para ambos
          if (match.whiteUserId && match.wager > 0)
            await refundFromEscrow(tx, match.whiteUserId, match.wager, match.id);
          if (match.blackUserId && match.wager > 0)
            await refundFromEscrow(tx, match.blackUserId, match.wager, match.id);
        } else if (winnerId) {
          const loserId = winnerId === match.whiteUserId ? match.blackUserId : match.whiteUserId;
          const pot = match.wager * 2;
          const rake = Math.floor((pot * match.rakeBps) / 10000);
          payout = pot - rake;
          if (match.wager > 0 && loserId) {
            await consumeEscrow(tx, loserId, match.wager, match.id);
            await payWinner(tx, winnerId, match.wager, payout, match.id);
          }
        }
      }

      const updated = await tx.match.update({
        where: { id: match.id },
        data: {
          fen: moveRes.fen,
          pgn: moveRes.pgn,
          moveCount: newPly,
          turn: moveRes.turn,
          status,
          result: matchResult,
          winnerId,
          finishedAt: finishedAt ?? undefined,
          payout: payout || match.payout,
        },
      });

      return updated;
    });
    return NextResponse.json({ ok: true, match: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro no lance" },
      { status: 400 }
    );
  }
}
