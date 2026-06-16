import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MatchClient } from "./MatchClient";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      whiteUser: { select: { id: true, username: true, rating: true } },
      blackUser: { select: { id: true, username: true, rating: true } },
      winner: { select: { id: true, username: true } },
    },
  });
  if (!match) notFound();

  return <MatchClient initialMatch={JSON.parse(JSON.stringify(match))} viewerId={session.user.id} />;
}
