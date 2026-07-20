// Estilos de peças alternativos renderizados com glifos unicode — zero assets.
// "classic" usa as peças padrão (SVG) do react-chessboard (customPieces = undefined).

import React from "react";

export type PieceSet = "classic" | "minimal" | "neon" | "royal";

export const PIECE_SET_OPTIONS: { value: PieceSet; label: string; emoji: string; desc: string }[] = [
  { value: "classic", label: "Clássico", emoji: "♟", desc: "Peças padrão desenhadas" },
  { value: "minimal", label: "Minimal",  emoji: "♞", desc: "Glifos limpos preto & branco" },
  { value: "neon",    label: "Neon",     emoji: "✨", desc: "Glifos com brilho ciano/magenta" },
  { value: "royal",   label: "Royal",    emoji: "👑", desc: "Dourado vs prata" },
];

const GLYPHS: Record<string, string> = {
  P: "♟", N: "♞", B: "♝", R: "♜", Q: "♛", K: "♚",
};

type PieceRenderProps = { squareWidth: number };
type PieceRenderer = (props: PieceRenderProps) => React.ReactElement;

type SetStyle = {
  white: React.CSSProperties;
  black: React.CSSProperties;
};

const SET_STYLES: Record<Exclude<PieceSet, "classic">, SetStyle> = {
  minimal: {
    white: { color: "#f5f5fa", textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 1px #000" },
    black: { color: "#1b1b26", textShadow: "0 1px 1px rgba(255,255,255,0.25)" },
  },
  neon: {
    white: { color: "#d8fdff", textShadow: "0 0 6px rgba(64,224,255,0.95), 0 0 14px rgba(64,224,255,0.55), 0 1px 2px #000" },
    black: { color: "#2a0f33", textShadow: "0 0 6px rgba(255,64,224,0.95), 0 0 14px rgba(255,64,224,0.5)" },
  },
  royal: {
    white: { color: "#f5b301", textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(245,179,1,0.35)" },
    black: { color: "#b8c0d0", textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(184,192,208,0.3)" },
  },
};

// Cache por set — evita recriar os 12 renderers a cada render.
const cache = new Map<PieceSet, Record<string, PieceRenderer>>();

export function getCustomPieces(set: PieceSet): Record<string, PieceRenderer> | undefined {
  if (set === "classic") return undefined;
  const hit = cache.get(set);
  if (hit) return hit;

  const style = SET_STYLES[set];
  const pieces: Record<string, PieceRenderer> = {};
  for (const color of ["w", "b"] as const) {
    for (const type of ["P", "N", "B", "R", "Q", "K"] as const) {
      const key = `${color}${type}`;
      const css = color === "w" ? style.white : style.black;
      pieces[key] = ({ squareWidth }: PieceRenderProps) =>
        React.createElement(
          "div",
          {
            style: {
              width: squareWidth,
              height: squareWidth,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: squareWidth * 0.78,
              lineHeight: 1,
              userSelect: "none",
              ...css,
            },
          },
          GLYPHS[type]
        );
    }
  }
  cache.set(set, pieces);
  return pieces;
}

export function getPieceSet(): PieceSet {
  if (typeof window === "undefined") return "classic";
  try {
    const v = localStorage.getItem("xa.pieceSet") as PieceSet | null;
    if (v && PIECE_SET_OPTIONS.some((o) => o.value === v)) return v;
  } catch { /* ignore */ }
  return "classic";
}

export function setPieceSet(set: PieceSet) {
  try { localStorage.setItem("xa.pieceSet", set); } catch { /* ignore */ }
}
