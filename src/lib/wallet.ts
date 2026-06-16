import { prisma } from "@/lib/prisma";
import type { Prisma, TransactionType } from "@prisma/client";

export async function getOrCreateWallet(userId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (w) return w;
  return prisma.wallet.create({ data: { userId, balance: 0, locked: 0 } });
}

/**
 * Debita do saldo livre e move para `locked` (escrow).
 * Lança erro se saldo insuficiente.
 */
export async function lockForWager(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  matchId: string
) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error("Carteira não encontrada");
  if (wallet.balance < amount) throw new Error("Saldo insuficiente");

  const updated = await tx.wallet.update({
    where: { userId },
    data: { balance: { decrement: amount }, locked: { increment: amount } },
  });

  await tx.transaction.create({
    data: {
      userId,
      type: "WAGER_LOCK",
      amount: -amount,
      balanceAfter: updated.balance,
      matchId,
      note: "Aposta em escrow",
    },
  });

  return updated;
}

/**
 * Devolve `amount` do escrow para o saldo livre (caso de cancelamento/empate).
 */
export async function refundFromEscrow(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  matchId: string,
  txType: TransactionType = "WAGER_REFUND",
  note?: string
) {
  const updated = await tx.wallet.update({
    where: { userId },
    data: { balance: { increment: amount }, locked: { decrement: amount } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type: txType,
      amount,
      balanceAfter: updated.balance,
      matchId,
      note: note ?? "Reembolso de aposta",
    },
  });
  return updated;
}

/**
 * Remove `amount` do escrow definitivamente (sem creditar — usado quando perde).
 */
export async function consumeEscrow(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  matchId: string
) {
  const updated = await tx.wallet.update({
    where: { userId },
    data: { locked: { decrement: amount } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type: "WAGER_LOSS",
      amount: -amount,
      balanceAfter: updated.balance,
      matchId,
      note: "Aposta perdida",
    },
  });
  return updated;
}

/**
 * Credita o prêmio (pot - rake) na carteira do vencedor.
 */
export async function payWinner(
  tx: Prisma.TransactionClient,
  userId: string,
  wagerInEscrow: number,
  payout: number,
  matchId: string
) {
  // primeiro libera o que estava em escrow do vencedor
  await tx.wallet.update({
    where: { userId },
    data: { locked: { decrement: wagerInEscrow } },
  });
  const updated = await tx.wallet.update({
    where: { userId },
    data: { balance: { increment: payout } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type: "WAGER_WIN",
      amount: payout,
      balanceAfter: updated.balance,
      matchId,
      note: "Prêmio recebido",
    },
  });
  return updated;
}
