import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ whiteUserId: session.user.id }, { blackUserId: session.user.id }],
      status: "FINISHED",
    },
    include: {
      whiteUser: { select: { id: true, username: true } },
      blackUser: { select: { id: true, username: true } },
      winner: { select: { id: true, username: true } },
    },
    orderBy: { finishedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ matches });
}
