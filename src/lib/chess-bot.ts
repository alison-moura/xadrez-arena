import { Chess, type Move } from "chess.js";

export const BOT_USER_ID = "00000000-0000-0000-0000-0000000000b0";

export type Difficulty = "easy" | "medium" | "hard";

// Profundidade do minimax. Depth 4 ainda é rápido com alpha-beta + ordenação,
// mas joga MUITO melhor que depth 3 (vê combinações simples de 2 jogadas).
const DEPTH: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 4 };

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

// Piece-square tables (white perspective; mirrored for black).
// Source: classic chess programming tables (Tomasz Michniewski).
// prettier-ignore
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const PST_KNIGHT = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];
// prettier-ignore
const PST_BISHOP = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];
// prettier-ignore
const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
// prettier-ignore
const PST_QUEEN = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];
// prettier-ignore
const PST_KING_MID = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

const PST_BY_TYPE: Record<string, number[]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING_MID,
};

function squareIndex(file: number, rank: number, isWhite: boolean): number {
  // chess.js board() returns row 0 = rank 8. white PSTs are indexed [0..63] from rank 8 (top).
  // For black, mirror vertically (use 7 - rank).
  const r = isWhite ? rank : 7 - rank;
  return r * 8 + file;
}

function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -100000 : 100000;
  if (chess.isStalemate() || chess.isDraw()) return 0;

  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const mat = PIECE_VALUES[p.type] ?? 0;
      const pst = PST_BY_TYPE[p.type]?.[squareIndex(f, r, p.color === "w")] ?? 0;
      const v = mat + pst;
      score += p.color === "w" ? v : -v;
    }
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  // capturas e promoções primeiro pra acelerar alpha-beta
  return [...moves].sort((a, b) => {
    const sa = (a.captured ? PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece] / 10 : 0) +
               (a.promotion ? 900 : 0);
    const sb = (b.captured ? PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece] / 10 : 0) +
               (b.promotion ? 900 : 0);
    return sb - sa;
  });
}

function search(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  const moves = orderMoves(chess.moves({ verbose: true }) as Move[]);
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const s = search(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      const s = search(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (s < best) best = s;
      if (s < beta) beta = s;
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Devolve o melhor lance pro lado que está pra mover, ou null se não há lances.
 */
export function pickBotMove(fen: string, difficulty: Difficulty): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true }) as Move[];
  if (moves.length === 0) return null;

  const depth = DEPTH[difficulty];
  const isWhite = chess.turn() === "w";

  // easy: 15% de chance de jogar lance random (era 35% — beatable demais)
  if (difficulty === "easy" && Math.random() < 0.15) {
    const rnd = moves[Math.floor(Math.random() * moves.length)];
    return { from: rnd.from, to: rnd.to, promotion: rnd.promotion };
  }

  const ordered = orderMoves(moves);
  let bestScore = isWhite ? -Infinity : Infinity;
  const scored: { m: Move; s: number }[] = [];
  for (const m of ordered) {
    chess.move(m);
    const s = search(chess, depth - 1, -Infinity, Infinity, !isWhite);
    chess.undo();
    scored.push({ m, s });
    if (isWhite ? s > bestScore : s < bestScore) bestScore = s;
  }

  // Tolerância de variedade depende da dificuldade.
  // easy aceita até 50cp de imprecisão, hard só joga melhor lance.
  const tolerance = difficulty === "easy" ? 50 : difficulty === "medium" ? 15 : 0;
  const candidates = scored.filter((x) =>
    isWhite ? x.s >= bestScore - tolerance : x.s <= bestScore + tolerance
  );
  const pick = candidates[Math.floor(Math.random() * candidates.length)].m;
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
