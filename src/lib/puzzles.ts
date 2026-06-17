// Curadoria simples de puzzles táticos.
// Formato Lichess: `fen` é a posição inicial do problema. O lance do oponente
// já está embutido na sequência: a primeira jogada de `moves` é executada
// automaticamente pelo "adversário", depois o jogador deve responder.
// `moves` está em UCI (e2e4, e7e8q, etc.).

export interface PuzzleDef {
  id: string;
  fen: string;
  moves: string[];          // UCI alternados — começa pelo lance do oponente
  rating: number;
  themes: string[];
  reward: number;           // coins ganhos ao resolver
}

const THEME_LABELS: Record<string, string> = {
  mateIn1:        "Mate em 1",
  mateIn2:        "Mate em 2",
  mateIn3:        "Mate em 3",
  fork:           "Garfo",
  pin:            "Cravada",
  skewer:         "Espeto",
  discoveredAttack: "Ataque descoberto",
  doubleAttack:   "Ataque duplo",
  sacrifice:      "Sacrifício",
  backRankMate:   "Mate do corredor",
  smotheredMate:  "Mate sufocado",
  hangingPiece:   "Peça pendurada",
  promotion:      "Promoção",
  trappedPiece:   "Peça encurralada",
  zugzwang:       "Zugzwang",
  endgame:        "Final",
  middlegame:     "Meio-jogo",
  opening:        "Abertura",
  defensive:      "Defesa",
  attraction:     "Atração",
  deflection:     "Desvio",
};

export function themeLabel(theme: string): string {
  return THEME_LABELS[theme] ?? theme;
}

// Banco curado. Pra uma plataforma real, isso seria substituído por uma tabela.
// Cada `moves[0]` é o pré-lance do oponente; o usuário responde a partir do índice 1.
export const PUZZLE_BANK: PuzzleDef[] = [
  {
    id: "p001",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    moves: ["h5f7"],
    rating: 600,
    themes: ["mateIn1", "opening", "backRankMate"],
    reward: 30,
  },
  {
    id: "p002",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    moves: ["d1d8"],
    rating: 700,
    themes: ["mateIn1", "backRankMate", "endgame"],
    reward: 30,
  },
  {
    id: "p003",
    fen: "r1bq1rk1/ppp2ppp/2n5/3np3/1bB5/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 0 7",
    moves: ["c4d5", "d8d5", "f3e5"],
    rating: 1200,
    themes: ["fork", "middlegame"],
    reward: 50,
  },
  {
    id: "p004",
    fen: "r3kb1r/pp1n1ppp/2p1p3/q7/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w kq - 0 9",
    moves: ["c3b5", "a5d8", "b5c7"],
    rating: 1100,
    themes: ["fork", "middlegame"],
    reward: 45,
  },
  {
    id: "p005",
    fen: "r4rk1/ppp2ppp/8/3qp3/3b4/1B6/PPP2PPP/R1BQR1K1 w - - 0 1",
    moves: ["b3d5", "d4f2", "g1f2"],
    rating: 1300,
    themes: ["pin", "middlegame", "deflection"],
    reward: 60,
  },
  {
    id: "p006",
    fen: "6k1/5p2/6p1/8/3Q4/7P/5PP1/3q2K1 b - - 0 1",
    moves: ["d1d4"],
    rating: 800,
    themes: ["endgame", "defensive"],
    reward: 35,
  },
  {
    id: "p007",
    fen: "6k1/5ppp/8/8/8/8/5P1P/4R1K1 w - - 0 1",
    moves: ["e1e8"],
    rating: 550,
    themes: ["mateIn1", "backRankMate", "endgame"],
    reward: 25,
  },
  {
    id: "p008",
    fen: "r1bqk2r/ppp2ppp/2n2n2/3pp3/1b1P4/2NBPN2/PPP2PPP/R1BQK2R w KQkq - 0 6",
    moves: ["d4e5", "c6e5", "f3e5", "f6e4", "d3e4"],
    rating: 1400,
    themes: ["middlegame", "discoveredAttack"],
    reward: 60,
  },
  {
    id: "p009",
    fen: "4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    moves: ["d1d8", "e8d8"],
    rating: 900,
    themes: ["endgame", "sacrifice"],
    reward: 40,
  },
  {
    id: "p010",
    fen: "r4rk1/1pp2ppp/p1n5/4pb2/1bP5/1Q2PN2/PB1NBPPP/R3K2R w KQ - 0 11",
    moves: ["b3b4", "c6b4", "b2e5"],
    rating: 1500,
    themes: ["fork", "middlegame"],
    reward: 70,
  },
  {
    id: "p011",
    fen: "6k1/5p1p/3p2p1/2pP4/r1P5/4R3/5PPP/6K1 b - - 0 1",
    moves: ["a4c4", "e3e8"],
    rating: 1000,
    themes: ["endgame", "backRankMate"],
    reward: 45,
  },
  {
    id: "p012",
    fen: "r1bqr1k1/ppp2ppp/2np1n2/4p3/1bB1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 7",
    moves: ["c1g5", "h7h6", "g5f6", "d8f6", "c3d5"],
    rating: 1450,
    themes: ["middlegame", "pin", "fork"],
    reward: 65,
  },
  {
    id: "p013",
    fen: "rn1q1rk1/pp3ppp/2pb1n2/3p4/3P4/3BPN2/PP3PPP/RNBQ1RK1 w - - 0 9",
    moves: ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5"],
    rating: 1600,
    themes: ["sacrifice", "attack", "middlegame"],
    reward: 80,
  },
  {
    id: "p014",
    fen: "7k/p5pp/1p3p2/3p4/3P4/1P3P2/P5PP/7K w - - 0 1",
    moves: ["a2a4"],
    rating: 700,
    themes: ["endgame", "zugzwang"],
    reward: 35,
  },
  {
    id: "p015",
    fen: "r4rk1/ppp1qpp1/2n4p/3pp3/1bPP4/2N1PN2/PP2BPPP/R2Q1RK1 w - - 0 11",
    moves: ["d4e5", "c6e5", "c3b5"],
    rating: 1350,
    themes: ["fork", "middlegame", "discoveredAttack"],
    reward: 60,
  },
  {
    id: "p016",
    fen: "6k1/5ppp/8/8/8/8/8/R6K w - - 0 1",
    moves: ["a1a8"],
    rating: 500,
    themes: ["mateIn1", "backRankMate", "endgame"],
    reward: 25,
  },
  {
    id: "p017",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1K1R b kq - 5 4",
    moves: ["c6d4", "f3d4", "e5d4"],
    rating: 900,
    themes: ["fork", "opening"],
    reward: 40,
  },
  {
    id: "p018",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 2 4",
    moves: ["f1e2", "f8c5", "c2c3"],
    rating: 700,
    themes: ["opening", "defensive"],
    reward: 30,
  },
  {
    id: "p019",
    fen: "6k1/6pp/6p1/8/8/8/5PPP/3R2K1 w - - 0 1",
    moves: ["d1d8", "g8f7", "d8h8"],
    rating: 1100,
    themes: ["endgame", "skewer"],
    reward: 50,
  },
  {
    id: "p020",
    fen: "5rk1/pp3ppp/2p5/3n4/8/2N5/PP3PPP/3R2K1 w - - 0 1",
    moves: ["c3d5", "c6d5", "d1d5"],
    rating: 1000,
    themes: ["middlegame", "doubleAttack"],
    reward: 45,
  },
  {
    id: "p021",
    fen: "r4rk1/pppq1ppp/2n5/3p4/3P4/2NB4/PPP2PPP/R2Q1RK1 w - - 0 1",
    moves: ["d3h7", "g8h7"],
    rating: 1300,
    themes: ["sacrifice", "middlegame"],
    reward: 60,
  },
  {
    id: "p022",
    fen: "6k1/5ppp/8/8/8/5P2/5KPP/r7 b - - 0 1",
    moves: ["a1f1", "f2f1"],
    rating: 750,
    themes: ["endgame", "defensive"],
    reward: 35,
  },
  {
    id: "p023",
    fen: "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
    moves: ["d1c2", "c7c5", "a2a3"],
    rating: 1200,
    themes: ["opening", "middlegame"],
    reward: 55,
  },
  {
    id: "p024",
    fen: "6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1",
    moves: ["a1a8"],
    rating: 550,
    themes: ["mateIn1", "backRankMate", "endgame"],
    reward: 25,
  },
  {
    id: "p025",
    fen: "r1bq1rk1/pp3ppp/2nbpn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
    moves: ["d3h7", "g8h7", "f3g5"],
    rating: 1500,
    themes: ["sacrifice", "middlegame", "attack"],
    reward: 75,
  },
  {
    id: "p026",
    fen: "8/4kpp1/8/3K4/8/8/8/4R3 w - - 0 1",
    moves: ["e1e7"],
    rating: 800,
    themes: ["endgame", "pin"],
    reward: 35,
  },
  {
    id: "p027",
    fen: "r1b1k2r/ppppqppp/2n2n2/4p3/1bB1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6",
    moves: ["c1g5", "h7h6", "g5f6"],
    rating: 1200,
    themes: ["pin", "middlegame"],
    reward: 55,
  },
  {
    id: "p028",
    fen: "r4rk1/pp3ppp/2n1pn2/q1bp4/8/2N1PN2/PPB2PPP/R2QK2R w KQ - 0 11",
    moves: ["c2h7", "g8h7", "f3g5"],
    rating: 1450,
    themes: ["sacrifice", "fork", "middlegame"],
    reward: 70,
  },
  {
    id: "p029",
    fen: "8/8/8/2k5/8/2K5/8/3Q4 w - - 0 1",
    moves: ["d1d5"],
    rating: 600,
    themes: ["endgame", "mateIn3"],
    reward: 30,
  },
  {
    id: "p030",
    fen: "rnbqkbnr/ppp2ppp/8/3pp3/3P4/4P3/PPP2PPP/RNBQKBNR w KQkq - 0 3",
    moves: ["d4e5", "d5d4", "e3d4"],
    rating: 800,
    themes: ["opening", "trade"],
    reward: 35,
  },
  {
    id: "p031",
    fen: "5rk1/6pp/8/8/8/8/PP3PPP/3R2K1 w - - 0 1",
    moves: ["d1d8", "f8d8"],
    rating: 650,
    themes: ["endgame", "trade"],
    reward: 30,
  },
  {
    id: "p032",
    fen: "5rk1/pp3ppp/8/8/2B5/8/PP3PPP/4R1K1 w - - 0 1",
    moves: ["c4f7", "g8f7", "e1e7"],
    rating: 1100,
    themes: ["sacrifice", "endgame", "fork"],
    reward: 50,
  },
];

export function puzzleOfDay(date: Date = new Date()): PuzzleDef {
  // Determinístico por dia (UTC, evita problemas com timezone)
  const epoch = Date.UTC(2026, 0, 1);
  const day   = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - epoch) / 86_400_000);
  const idx   = ((day % PUZZLE_BANK.length) + PUZZLE_BANK.length) % PUZZLE_BANK.length;
  return PUZZLE_BANK[idx];
}

export function puzzleById(id: string): PuzzleDef | undefined {
  return PUZZLE_BANK.find((p) => p.id === id);
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
