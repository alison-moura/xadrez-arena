"use client";
import { useEffect, useState } from "react";

interface Props {
  endsAt: string;             // ISO
  className?: string;
  prefix?: string;
  expiredLabel?: string;
}

function diffParts(ms: number): { h: number; m: number; s: number; expired: boolean } {
  if (ms <= 0) return { h: 0, m: 0, s: 0, expired: true };
  const total = Math.floor(ms / 1000);
  return {
    h:        Math.floor(total / 3600),
    m:        Math.floor((total % 3600) / 60),
    s:        total % 60,
    expired:  false,
  };
}

export function CountdownTimer({ endsAt, className, prefix, expiredLabel = "encerrado" }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = Date.parse(endsAt);
  if (!target || isNaN(target)) return null;
  const { h, m, s, expired } = diffParts(target - now);

  if (expired) {
    return <span className={`text-muted ${className ?? ""}`}>{expiredLabel}</span>;
  }

  const urgent = (h === 0 && m < 5);
  const label = h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <span className={`font-mono tabular-nums ${urgent ? "text-danger animate-pulse" : "text-accent"} ${className ?? ""}`}>
      {prefix} {label}
    </span>
  );
}
