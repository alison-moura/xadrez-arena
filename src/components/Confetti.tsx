"use client";
import { useEffect, useState } from "react";

const PIECES = ["♔", "♕", "♖", "♗", "♘", "♙", "🎉", "✨", "🏆"];

type Particle = {
  id: number;
  emoji: string;
  left: number;     // %
  delay: number;    // ms
  duration: number; // ms
  rotation: number; // deg final
  size: number;     // px
  color: string;
};

export function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }
    const colors = ["#f5b301", "#41c96d", "#4a90d9", "#9b59b6", "#e15252"];
    const list: Particle[] = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      emoji:    PIECES[Math.floor(Math.random() * PIECES.length)],
      left:     Math.random() * 100,
      delay:    Math.random() * 600,
      duration: 1800 + Math.random() * 1200,
      rotation: Math.random() * 720 - 360,
      size:     18 + Math.random() * 24,
      color:    colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles(list);
    const t = setTimeout(() => setParticles([]), 4000);
    return () => clearTimeout(t);
  }, [active]);

  if (particles.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 select-none animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            color: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            // @ts-expect-error CSS custom prop
            "--rot": `${p.rotation}deg`,
          }}
        >{p.emoji}</span>
      ))}
    </div>
  );
}
