import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      whiteUser: { select: { id: true, username: true, rating: true } },
      blackUser: { select: { id: true, username: true, rating: true } },
      winner: { select: { id: true, username: true } },
      moves: { orderBy: { ply: "asc" } },
    },
  });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  return NextResponse.json({ match });
}
