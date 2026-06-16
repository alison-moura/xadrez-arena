import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockForWager } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  wager: z.number().int().min(0).max(1_000_000),
  preferredColor: z.enum(["w", "b", "random"]).default("random"),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "WAITING";

  const matches = await prisma.match.findMany({
    where: { status: status as "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED" },
    include: {
      whiteUser: { select: { id: true, username: true, rating: true } },
      blackUser: { select: { id: true, username: true, rating: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ matches });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { wager, preferredColor } = parsed.data;

  try {
    const match = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: session.user.id } });
      if (!wallet) throw new Error("Carteira não encontrada");
      if (wallet.balance < wager) throw new Error("Saldo insuficiente para a aposta");

      let color: "w" | "b";
      if (preferredColor === "random") color = Math.random() < 0.5 ? "w" : "b";
      else color = preferredColor;

      const created = await tx.match.create({
        data: {
          wager,
          status: "WAITING",
          creatorId: session.user.id,
          whiteUserId: color === "w" ? session.user.id : null,
          blackUserId: color === "b" ? session.user.id : null,
          pot: wager, // só o criador ainda
        },
      });

      if (wager > 0) {
        await lockForWager(tx, session.user.id, wager, created.id);
      }

      return created;
    });
    return NextResponse.json({ ok: true, matchId: match.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar partida" },
      { status: 400 }
    );
  }
}
