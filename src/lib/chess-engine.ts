import { Chess } from "chess.js";

export type Color = "w" | "b";

export interface MoveResult {
  fen: string;
  pgn: string;
  san: string;
  uci: string;
  turn: Color;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
}

export function applyMove(
  fen: string,
  pgn: string,
  move: { from: string; to: string; promotion?: string }
): MoveResult | null {
  const chess = new Chess(fen);
  if (pgn) {
    try {
      chess.loadPgn(pgn);
    } catch {
      // se PGN inválido, manter posição via FEN
    }
  }
  try {
    const m = chess.move({
      from: move.from,
      to: move.to,
      promotion: (move.promotion as "q" | "r" | "b" | "n" | undefined) ?? "q",
    });
    if (!m) return null;
    return {
      fen: chess.fen(),
      pgn: chess.pgn(),
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ""}`,
      turn: chess.turn() as Color,
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      isGameOver: chess.isGameOver(),
    };
  } catch {
    return null;
  }
}

export function gameStatus(fen: string) {
  const chess = new Chess(fen);
  return {
    turn: chess.turn() as Color,
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    isCheck: chess.isCheck(),
    isGameOver: chess.isGameOver(),
  };
}
