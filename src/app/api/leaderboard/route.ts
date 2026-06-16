import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const top = await prisma.user.findMany({
    orderBy: { rating: "desc" },
    take: 20,
    select: {
      id: true,
      username: true,
      rating: true,
      _count: {
        select: {
          matchesWon: true,
        },
      },
    },
  });

  return NextResponse.json({
    players: top.map((p) => ({
      id: p.id,
      username: p.username,
      rating: p.rating,
      wins: p._count.matchesWon,
    })),
  });
}
