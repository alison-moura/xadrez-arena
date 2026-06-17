import { TournamentDetailClient } from "./TournamentDetailClient";

export const dynamic = "force-dynamic";

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  return <TournamentDetailClient id={params.id} />;
}
