import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  method: z.string().min(2).max(50),
  destination: z.string().min(3).max(200),
});

const MIN_WITHDRAWAL = 100;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  if (parsed.data.amount < MIN_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Valor mínimo de saque: ${MIN_WITHDRAWAL} coins` },
      { status: 400 }
    );
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: session.user.id } });
      if (!wallet) throw new Error("Carteira não encontrada");
      if (wallet.balance < parsed.data.amount) throw new Error("Saldo insuficiente");

      const updated = await tx.wallet.update({
        where: { userId: session.user.id },
        data: { balance: { decrement: parsed.data.amount } },
      });
      await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: "WITHDRAWAL",
          amount: -parsed.data.amount,
          balanceAfter: updated.balance,
          note: `Saque solicitado via ${parsed.data.method}`,
        },
      });
      const wr = await tx.withdrawalRequest.create({
        data: {
          userId: session.user.id,
          amount: parsed.data.amount,
          method: parsed.data.method,
          destination: parsed.data.destination,
          status: "PENDING",
        },
      });
      return { wallet: updated, withdrawal: wr };
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 400 }
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const list = await prisma.withdrawalRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ withdrawals: list });
}
