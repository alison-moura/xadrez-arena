import { spawn } from "child_process";
import { Chess } from "chess.js";

export type MoveAnalysis = {
  san: string;
  uci: string;
  cpBefore: number;   // best centipawns available before the move (from mover's POV)
  cpAfter: number;    // centipawns after actual move (from mover's POV)
  cpl: number;        // centipawn loss (0 = perfect)
};

export type MatchAnalysis = {
  white: { avgCpl: number; accuracy: number };
  black: { avgCpl: number; accuracy: number };
  moves: MoveAnalysis[];
};

// Returns stdout lines from a one-shot stockfish invocation
function runStockfishCommands(commands: string[], timeoutMs = 8000): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let sf: ReturnType<typeof spawn>;

    try {
      sf = spawn("stockfish");
    } catch {
      resolve([]);
      return;
    }

    const timer = setTimeout(() => {
      sf.kill();
      resolve(lines);
    }, timeoutMs);

    sf.stdout?.on("data", (data: Buffer) => {
      lines.push(...data.toString().split("\n").filter(Boolean));
    });

    sf.on("close", () => {
      clearTimeout(timer);
      resolve(lines);
    });

    sf.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });

    if (sf.stdin) {
      for (const cmd of commands) sf.stdin.write(cmd + "\n");
      sf.stdin.end();
    }
  });
}

// Returns centipawns from the SIDE-TO-MOVE's perspective (positive = winning).
// Converts mate scores to ±10000.
function parseCp(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("info") || !line.includes("score")) continue;

    const mate = line.match(/score mate (-?\d+)/);
    if (mate) return parseInt(mate[1]) > 0 ? 10000 : -10000;

    const cp = line.match(/score cp (-?\d+)/);
    if (cp) return parseInt(cp[1]);
  }
  return 0;
}

// Accuracy formula approximating chess.com's model
function cplToAccuracy(avgCpl: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avgCpl) - 3.1669));
}

export async function analyzeMatch(pgn: string, depth = 15): Promise<MatchAnalysis | null> {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return null; }

  const history = chess.history({ verbose: true });
  if (history.length === 0) return null;

  const moveAnalyses: MoveAnalysis[] = [];
  const board = new Chess();

  let whiteCpl = 0, blackCpl = 0, wc = 0, bc = 0;

  for (const move of history) {
    const fen = board.fen();
    const isWhite = board.turn() === "w";

    // Evaluate the position BEFORE the move — score from the mover's POV
    const before = await runStockfishCommands([
      `position fen ${fen}`,
      `go depth ${depth}`,
      "quit",
    ]);
    const cpBefore = parseCp(before); // positive = mover is winning

    board.move(move.san);
    const fenAfter = board.fen();

    // Evaluate the position AFTER the move — score from OPPONENT's POV
    const after = await runStockfishCommands([
      `position fen ${fenAfter}`,
      `go depth ${depth}`,
      "quit",
    ]);
    const cpOpponent = parseCp(after); // positive = opponent is winning
    // From the mover's POV, flip sign
    const cpAfter = -cpOpponent;

    const cpl = Math.max(0, cpBefore - cpAfter);
    const uci = move.from + move.to + (move.promotion ?? "");

    moveAnalyses.push({ san: move.san, uci, cpBefore, cpAfter, cpl });

    if (isWhite) { whiteCpl += cpl; wc++; }
    else         { blackCpl += cpl; bc++; }
  }

  const whiteAvgCpl = wc > 0 ? whiteCpl / wc : 0;
  const blackAvgCpl = bc > 0 ? blackCpl / bc : 0;

  return {
    white: { avgCpl: whiteAvgCpl, accuracy: cplToAccuracy(whiteAvgCpl) },
    black: { avgCpl: blackAvgCpl, accuracy: cplToAccuracy(blackAvgCpl) },
    moves: moveAnalyses,
  };
}

// Returns a suspicion score 0–100 based on how inhuman the play was.
export function computeSuspicionScore(analysis: MatchAnalysis, moveCount: number): number {
  if (moveCount < 10) return 0;
  let score = 0;
  for (const { avgCpl } of [analysis.white, analysis.black]) {
    if (avgCpl < 10) score += 50;
    else if (avgCpl < 20) score += 30;
    else if (avgCpl < 30) score += 15;
  }
  for (const { accuracy } of [analysis.white, analysis.black]) {
    if (accuracy > 95) score += 20;
  }
  return Math.min(100, score);
}
