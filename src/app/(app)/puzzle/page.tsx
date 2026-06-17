import { PuzzleClient } from "./PuzzleClient";
import { puzzleOfDay, todayKey } from "@/lib/puzzles";

export const dynamic = "force-dynamic";

export default function PuzzlePage() {
  const puzzle = puzzleOfDay();
  return <PuzzleClient puzzle={puzzle} dayKey={todayKey()} />;
}
