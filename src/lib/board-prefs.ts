// Preferências de tabuleiro persistidas em localStorage. Componentes leem
// via `getBoardPrefs()` no useEffect inicial. Manter a API simples e sync.

import { getPieceSet, type PieceSet } from "@/lib/piece-sets";

export type AnimSpeed = "off" | "fast" | "normal" | "slow";

export interface BoardPrefs {
  highlightLegal: boolean;
  autoPromoteQueen: boolean;
  showNotation: boolean;
  animSpeed: AnimSpeed;
  pieceSet: PieceSet;
}

const DEFAULTS: BoardPrefs = {
  highlightLegal:   true,
  autoPromoteQueen: false,
  showNotation:     true,
  animSpeed:        "normal",
  pieceSet:         "classic",
};

export function getBoardPrefs(): BoardPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return {
      highlightLegal:   localStorage.getItem("xa.highlightLegal")   !== "0",
      autoPromoteQueen: localStorage.getItem("xa.autoPromote")      === "1",
      showNotation:     localStorage.getItem("xa.showNotation")     !== "0",
      animSpeed:        (localStorage.getItem("xa.animSpeed") as AnimSpeed) || "normal",
      pieceSet:         getPieceSet(),
    };
  } catch {
    return DEFAULTS;
  }
}

export function animDurationMs(speed: AnimSpeed): number {
  switch (speed) {
    case "off":    return 0;
    case "fast":   return 100;
    case "slow":   return 350;
    default:       return 200;
  }
}

export const ANIM_SPEED_OPTIONS: { value: AnimSpeed; label: string }[] = [
  { value: "off",    label: "Sem animação" },
  { value: "fast",   label: "Rápida" },
  { value: "normal", label: "Normal" },
  { value: "slow",   label: "Lenta" },
];
