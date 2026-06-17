import { Chess } from "chess.js";

export interface CoachTip {
  title: string;
  body: string;
  emoji: string;
}

function countPieces(fen: string): { w: Record<string, number>; b: Record<string, number> } {
  const board = new Chess(fen).board();
  const w: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const b: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      (cell.color === "w" ? w : b)[cell.type]++;
    }
  }
  return { w, b };
}

function pieceCode({ w, b }: ReturnType<typeof countPieces>): string {
  const fmt = (m: Record<string, number>) =>
    `${m.q ? "Q".repeat(m.q) : ""}${m.r ? "R".repeat(m.r) : ""}${m.b ? "B".repeat(m.b) : ""}${m.n ? "N".repeat(m.n) : ""}${m.p ? "P".repeat(m.p) : ""}`;
  return `${fmt(w)}K_${fmt(b)}K`;
}

// Detecta padrões comuns de final e retorna uma dica curta de coach.
export function endgameCoachTip(opts: {
  result: string | null;
  finalFen: string;
  moveCount: number;
}): CoachTip | null {
  const { result, finalFen, moveCount } = opts;

  const pieces = countPieces(finalFen);
  const code = pieceCode(pieces);

  // Empates típicos
  if (result === "DRAW") {
    // Material insuficiente comum: K_K, KN_K, KB_K, KB_KB (mesmo bispo), KN_KN
    if (code === "K_K") {
      return { emoji: "🤝", title: "Rei vs Rei", body: "Material insuficiente — não há como dar mate. Sempre empate." };
    }
    if (code === "KB_K" || code === "K_KB" || code === "KN_K" || code === "K_KN") {
      return { emoji: "🤝", title: "Material insuficiente", body: "Um bispo ou cavalo sozinho não consegue dar mate contra o rei adversário." };
    }
    if (code === "KNN_K" || code === "K_KNN") {
      return { emoji: "🤝", title: "Dois cavalos não fazem mate", body: "K+N+N vs K é tecnicamente empate — o defensor consegue se manter no canto." };
    }
    if (moveCount >= 100) {
      return { emoji: "📐", title: "Regra dos 50 lances", body: "Sem captura nem lance de peão em 50 lances, qualquer jogador pode reivindicar empate." };
    }
    return { emoji: "🤝", title: "Empate", body: "Resultado mais comum em finais equilibrados. Volte ao tabuleiro pra ver onde algo poderia ter sido jogado mais agressivamente." };
  }

  const whiteWins = result === "WHITE_WIN" || result === "BLACK_RESIGN" || result === "BLACK_TIMEOUT";
  const blackWins = result === "BLACK_WIN" || result === "WHITE_RESIGN" || result === "WHITE_TIMEOUT";

  // Mates por tempo
  if (result === "WHITE_TIMEOUT" || result === "BLACK_TIMEOUT") {
    return { emoji: "⏱", title: "Vitória por tempo", body: "Em finais simples, mantenha o relógio — um lance rápido vale mais que um perfeito. Pré-lances ajudam bastante." };
  }

  // Mates por desistência
  if (result === "WHITE_RESIGN" || result === "BLACK_RESIGN") {
    return { emoji: "🏳️", title: "Desistência", body: "Quando a posição vira insustentável (peça pra menos sem compensação), desistir é elegante e poupa tempo pra próxima." };
  }

  // Mate detectado — vamos tentar identificar o padrão
  const winnerPieces = whiteWins ? pieces.w : pieces.b;

  // KQ vs K
  if (winnerPieces.q >= 1 && winnerPieces.r === 0 && (whiteWins ? pieces.b : pieces.w).q === 0) {
    const opp = whiteWins ? pieces.b : pieces.w;
    if (opp.p === 0 && opp.n === 0 && opp.b === 0 && opp.r === 0 && opp.q === 0) {
      return { emoji: "♛", title: "Mate com a Dama", body: "Técnica: aproxime a dama do rei (cavalo de distância), force-o pra borda e dê o golpe com apoio do seu rei." };
    }
  }

  // KR vs K
  if (winnerPieces.r >= 1 && winnerPieces.q === 0) {
    const opp = whiteWins ? pieces.b : pieces.w;
    if (opp.p === 0 && opp.n === 0 && opp.b === 0 && opp.r === 0 && opp.q === 0) {
      return { emoji: "♜", title: "Mate com a Torre", body: "Use a torre pra cortar o rei adversário e empurre-o pra última fileira com seu próprio rei à frente (oposição)." };
    }
  }

  // KRR vs K (mate da escadinha)
  if (winnerPieces.r >= 2) {
    return { emoji: "🪜", title: "Mate da escadinha", body: "Duas torres dão mate sem ajuda do rei: alterne entre as fileiras forçando o rei pra borda." };
  }

  // Promoção: peão virou peça forte
  if (winnerPieces.q >= 2) {
    return { emoji: "👑", title: "Promoção decisiva", body: "Ter mais de uma dama é sinal de que uma promoção decidiu — exemplos clássicos de força de peões passados." };
  }

  // Mate na abertura
  if (moveCount <= 10) {
    return { emoji: "⚡", title: "Mate relâmpago", body: "Mates rapidíssimos costumam vir de descuido com f7/f2 ou da casa h7/h2 — sempre defenda esses pontos no plano de abertura." };
  }

  // Vitória genérica
  return {
    emoji: whiteWins ? "♔" : "♚",
    title: "Boa partida!",
    body: "Cada vitória é uma oportunidade de aprendizado. Revise a partida com o Stockfish pra ver se houve alguma reviravolta crítica.",
  };
}
