"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/lobby", label: "Lobby" },
  { href: "/history", label: "Histórico" },
  { href: "/leaderboard", label: "Ranking" },
  { href: "/achievements", label: "Conquistas" },
  { href: "/overwatch", label: "Overwatch" },
  { href: "/wallet", label: "Carteira" },
];

export function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const base = mobile
    ? "rounded px-3 py-1 text-sm transition-colors"
    : "rounded px-3 py-1 text-sm transition-colors";
  return (
    <>
      {NAV.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`${base} ${
              active
                ? "bg-surface font-medium text-white"
                : "text-muted hover:bg-surface hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
