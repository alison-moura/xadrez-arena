export type SkinRarity = "common" | "rare" | "epic" | "legendary";

export interface SkinDef {
  id: string;
  name: string;
  description: string;
  rarity: SkinRarity;
  price_coins: number;  // 0 = not purchasable (drop only or free)
  boardLight: string;
  boardDark: string;
  drop_weight: number;  // 0 = not droppable
}

export const SKIN_DEFS: Record<string, SkinDef> = {
  classic: {
    id: "classic",
    name: "Clássico",
    description: "O estilo padrão atemporal.",
    rarity: "common",
    price_coins: 0,
    boardLight: "#d8d8e5",
    boardDark: "#3a3a55",
    drop_weight: 0,
  },
  midnight: {
    id: "midnight",
    name: "Meia-Noite",
    description: "Tons escuros e misteriosos.",
    rarity: "common",
    price_coins: 300,
    boardLight: "#5a5a7a",
    boardDark: "#1a1a2e",
    drop_weight: 80,
  },
  neon: {
    id: "neon",
    name: "Neon Pulse",
    description: "Energia pulsante em verde neon.",
    rarity: "rare",
    price_coins: 750,
    boardLight: "#1a4a1a",
    boardDark: "#0d2a0d",
    drop_weight: 40,
  },
  crimson: {
    id: "crimson",
    name: "Blood Moon",
    description: "A lua vermelha domina o tabuleiro.",
    rarity: "rare",
    price_coins: 1000,
    boardLight: "#4a1a1a",
    boardDark: "#2e0d0d",
    drop_weight: 30,
  },
  gold: {
    id: "gold",
    name: "Ouro Puro",
    description: "Luxo em estado bruto.",
    rarity: "epic",
    price_coins: 2000,
    boardLight: "#c8a040",
    boardDark: "#7a5010",
    drop_weight: 15,
  },
  cyber: {
    id: "cyber",
    name: "Cyber Matrix",
    description: "O futuro digital do xadrez.",
    rarity: "epic",
    price_coins: 2500,
    boardLight: "#1a3a4a",
    boardDark: "#0d1e2e",
    drop_weight: 10,
  },
  platinum: {
    id: "platinum",
    name: "Platina Lendária",
    description: "Para os verdadeiros campeões.",
    rarity: "legendary",
    price_coins: 0,
    boardLight: "#d0d0d8",
    boardDark: "#707080",
    drop_weight: 3,
  },
};

export const RARITY_COLORS: Record<SkinRarity, string> = {
  common: "#8a8aa3",
  rare: "#4a90d9",
  epic: "#9b59b6",
  legendary: "#f5b301",
};

export const RARITY_LABELS: Record<SkinRarity, string> = {
  common: "Comum",
  rare: "Raro",
  epic: "Épico",
  legendary: "Lendário",
};
