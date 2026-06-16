import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ amount: z.number().int().positive().max(1_000_000) });

/**
 * Depósito simulado (sandbox). Em produção, integrar com gateway (Stripe/PIX/etc).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, balance: parsed.data.amount, locked: 0 },
      update: { balance: { increment: parsed.data.amount } },
    });
    await tx.transaction.create({
      data: {
        userId: session.user.id,
        type: "DEPOSIT",
        amount: parsed.data.amount,
        balanceAfter: wallet.balance,
        note: "Depósito simulado",
      },
    });
    return wallet;
  });

  return NextResponse.json({ ok: true, wallet: result });
}
