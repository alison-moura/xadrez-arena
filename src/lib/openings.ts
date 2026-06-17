// Mini banco de aberturas: SAN-prefixos → nome.
// Não é exaustivo (~70 entradas, cobre as comuns). Casa pelo prefixo mais longo.

type Entry = { moves: string[]; name: string };

// Importante: ordene do mais específico (longo) → mais genérico,
// porque iteramos do final pro começo procurando match.
const RAW: Entry[] = [
  // 1.e4 e5
  { moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O"], name: "Ruy López — Variação Principal" },
  { moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4"],            name: "Ruy López — Variação Morphy" },
  { moves: ["e4","e5","Nf3","Nc6","Bb5","Nf6"],                 name: "Ruy López — Defesa Berlinesa" },
  { moves: ["e4","e5","Nf3","Nc6","Bb5"],                       name: "Ruy López" },
  { moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4"],            name: "Italiana — Gambito Evans" },
  { moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3"],            name: "Italiana — Giuoco Pianíssimo" },
  { moves: ["e4","e5","Nf3","Nc6","Bc4","Nf6"],                 name: "Defesa dos Dois Cavalos" },
  { moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5"],                 name: "Italiana (Giuoco Piano)" },
  { moves: ["e4","e5","Nf3","Nc6","Bc4"],                       name: "Abertura Italiana" },
  { moves: ["e4","e5","Nf3","Nc6","d4"],                        name: "Gambito Escocês" },
  { moves: ["e4","e5","Nf3","Nc6","Nc3","Nf6"],                 name: "Quatro Cavalos" },
  { moves: ["e4","e5","Nf3","Nf6"],                             name: "Defesa Russa (Petroff)" },
  { moves: ["e4","e5","Nf3","d6"],                              name: "Defesa Philidor" },
  { moves: ["e4","e5","Nf3"],                                   name: "Abertura do Rei (Cavalo)" },
  { moves: ["e4","e5","Nc3"],                                   name: "Vienense" },
  { moves: ["e4","e5","f4"],                                    name: "Gambito do Rei" },
  { moves: ["e4","e5","Bc4"],                                   name: "Abertura do Bispo" },
  { moves: ["e4","e5"],                                         name: "Aberta (1.e4 e5)" },

  // 1.e4 c5 (Siciliana)
  { moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"],  name: "Siciliana — Najdorf" },
  { moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6"],  name: "Siciliana — Dragão" },
  { moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nc6"],             name: "Siciliana — Clássica" },
  { moves: ["e4","c5","Nf3","e6","d4","cxd4","Nxd4","Nc6"],             name: "Siciliana — Taimanov" },
  { moves: ["e4","c5","Nf3","Nc6"],                                     name: "Siciliana — Cavalos" },
  { moves: ["e4","c5","Nc3"],                                           name: "Siciliana — Fechada" },
  { moves: ["e4","c5","c3"],                                            name: "Siciliana — Alapin" },
  { moves: ["e4","c5"],                                                 name: "Defesa Siciliana" },

  // 1.e4 outros
  { moves: ["e4","e6","d4","d5","Nc3"],                                 name: "Francesa — Variação Clássica" },
  { moves: ["e4","e6","d4","d5","exd5"],                                name: "Francesa — Troca" },
  { moves: ["e4","e6"],                                                 name: "Defesa Francesa" },
  { moves: ["e4","c6","d4","d5","Nc3"],                                 name: "Caro-Kann — Clássica" },
  { moves: ["e4","c6"],                                                 name: "Defesa Caro-Kann" },
  { moves: ["e4","d5"],                                                 name: "Defesa Escandinava" },
  { moves: ["e4","d6"],                                                 name: "Defesa Pirc" },
  { moves: ["e4","g6"],                                                 name: "Defesa Moderna" },
  { moves: ["e4","Nf6"],                                                name: "Defesa Alekhine" },
  { moves: ["e4","Nc6"],                                                name: "Defesa Nimzowitsch" },
  { moves: ["e4"],                                                      name: "Abertura do Rei (1.e4)" },

  // 1.d4
  { moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5"],                     name: "Gambito da Dama — Ortodoxa" },
  { moves: ["d4","d5","c4","e6"],                                       name: "Gambito da Dama — Recusado" },
  { moves: ["d4","d5","c4","c6"],                                       name: "Defesa Eslava" },
  { moves: ["d4","d5","c4","dxc4"],                                     name: "Gambito da Dama — Aceito" },
  { moves: ["d4","d5","c4"],                                            name: "Gambito da Dama" },
  { moves: ["d4","d5","Nf3"],                                           name: "Sistema do Peão da Dama" },
  { moves: ["d4","Nf6","c4","e6","Nc3","Bb4"],                          name: "Defesa Nimzo-Índia" },
  { moves: ["d4","Nf6","c4","e6","g3"],                                 name: "Abertura Catalã" },
  { moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4"],                     name: "Defesa Índia do Rei — Principal" },
  { moves: ["d4","Nf6","c4","g6"],                                      name: "Defesa Índia do Rei" },
  { moves: ["d4","Nf6","c4","c5"],                                      name: "Defesa Benoni" },
  { moves: ["d4","Nf6","c4","e6"],                                      name: "Índia do Rainha (linha principal)" },
  { moves: ["d4","Nf6","c4"],                                           name: "Sistemas Índios" },
  { moves: ["d4","Nf6","Nf3","g6"],                                     name: "Sistema Londres / Índia" },
  { moves: ["d4","f5"],                                                 name: "Defesa Holandesa" },
  { moves: ["d4","d5"],                                                 name: "Aberta (1.d4 d5)" },
  { moves: ["d4","Nf6"],                                                name: "Defesa Índia" },
  { moves: ["d4"],                                                      name: "Abertura da Dama" },

  // 1.c4 / 1.Nf3
  { moves: ["c4","e5"],                                                 name: "Inglesa — Siciliana Invertida" },
  { moves: ["c4","c5"],                                                 name: "Inglesa — Simétrica" },
  { moves: ["c4","Nf6"],                                                name: "Inglesa — Anglo-Índia" },
  { moves: ["c4"],                                                      name: "Abertura Inglesa" },
  { moves: ["Nf3","d5","g3"],                                           name: "Sistema Réti" },
  { moves: ["Nf3","Nf6","g3"],                                          name: "Réti — King's Fianchetto" },
  { moves: ["Nf3"],                                                     name: "Abertura Réti" },

  // 1.b3 / 1.g3 / outros
  { moves: ["b3"],                                                      name: "Abertura Larsen" },
  { moves: ["g3"],                                                      name: "Abertura Benko" },
  { moves: ["f4"],                                                      name: "Abertura Bird" },
  { moves: ["b4"],                                                      name: "Abertura Sokolsky" },
];

// Ordena por tamanho (mais longo primeiro)
const ENTRIES = [...RAW].sort((a, b) => b.moves.length - a.moves.length);

export function detectOpening(history: string[]): string | null {
  if (!history.length) return null;
  for (const e of ENTRIES) {
    if (e.moves.length > history.length) continue;
    let ok = true;
    for (let i = 0; i < e.moves.length; i++) {
      if (history[i] !== e.moves[i]) { ok = false; break; }
    }
    if (ok) return e.name;
  }
  return null;
}
