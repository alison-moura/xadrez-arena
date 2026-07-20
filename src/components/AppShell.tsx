"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { formatCoins } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Jogar",
    items: [
      { href: "/lobby",       label: "Lobby",     icon: "♟" },
      { href: "/tournaments", label: "Torneios",  icon: "🏆" },
      { href: "/watch",       label: "Assistir",  icon: "📺" },
    ],
  },
  {
    title: "Aprender",
    items: [
      { href: "/puzzle",      label: "Puzzle do Dia", icon: "🧩" },
      { href: "/puzzle-rush", label: "Puzzle Rush",   icon: "⚡" },
      { href: "/openings",    label: "Aberturas",     icon: "📖" },
    ],
  },
  {
    title: "Comunidade",
    items: [
      { href: "/following",   label: "Seguindo",  icon: "👥" },
      { href: "/leaderboard", label: "Ranking",   icon: "🥇" },
      { href: "/overwatch",   label: "Overwatch", icon: "🕵️" },
    ],
  },
  {
    title: "Você",
    items: [
      { href: "/stats",        label: "Estatísticas", icon: "📊" },
      { href: "/history",      label: "Histórico",    icon: "🕘" },
      { href: "/achievements", label: "Conquistas",   icon: "🎖️" },
      { href: "/notes",        label: "Anotações",    icon: "📝" },
    ],
  },
  {
    title: "Loja",
    items: [
      { href: "/shop",      label: "Loja de skins", icon: "🛍️" },
      { href: "/inventory", label: "Inventário",    icon: "🎒" },
      { href: "/market",    label: "Mercado P2P",   icon: "🤝" },
    ],
  },
];

function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function AppShell({
  username,
  balance,
  locked,
  isAdmin,
  children,
}: {
  username: string;
  balance: number;
  locked: number;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fecha o drawer ao navegar
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Trava scroll do body com drawer aberto
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const hue = avatarHue(username);

  const sidebarContent = (
    <>
      {/* Logo */}
      <Link href="/lobby" className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accentDark text-xl text-black shadow-md shadow-accent/20">♞</span>
        <div className="leading-tight">
          <div className="text-base font-extrabold tracking-tight">Xadrez <span className="text-accent">Arena</span></div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted">jogue · aposte · vença</div>
        </div>
      </Link>

      {/* CTA principal */}
      <div className="px-3 pb-2">
        <Link
          href="/lobby"
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent to-accentDark py-2.5 text-sm font-bold text-black shadow-lg shadow-accent/20 transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          ▶ Jogar agora
        </Link>
      </div>

      {/* Navegação agrupada */}
      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted/70">
              {g.title}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-accent/15 font-semibold text-accent"
                          : "text-muted hover:bg-surfaceAlt hover:text-white"
                      }`}
                    >
                      <span className={`w-5 text-center text-sm ${active ? "" : "opacity-70 group-hover:opacity-100"}`}>
                        {item.icon}
                      </span>
                      {item.label}
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {isAdmin && (
          <div>
            <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted/70">Admin</div>
            <Link
              href="/admin/withdrawals"
              className={`flex items-center gap-2.5 rounded-lg border border-accent/25 px-2.5 py-1.5 text-[13px] transition-colors ${
                pathname.startsWith("/admin") ? "bg-accent/15 font-semibold text-accent" : "text-accent/80 hover:bg-accent/10"
              }`}
            >
              <span className="w-5 text-center text-sm">🛡️</span> Saques pendentes
            </Link>
          </div>
        )}
      </nav>

      {/* Rodapé: carteira + usuário */}
      <div className="space-y-2 border-t border-border/70 px-3 py-3">
        <Link
          href="/wallet"
          className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
            pathname.startsWith("/wallet")
              ? "border-accent/50 bg-accent/10"
              : "border-border bg-surfaceAlt/60 hover:border-accent/40"
          }`}
        >
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="text-sm">💰</span> Carteira
          </span>
          <span className="text-right leading-tight">
            <span className="block text-sm font-bold text-accent">{formatCoins(balance)}</span>
            {locked > 0 && <span className="block text-[9px] text-muted">🔒 {formatCoins(locked)} em jogo</span>}
          </span>
        </Link>

        <div className="flex items-center gap-2 rounded-lg px-1 py-1">
          <Link
            href={`/u/${encodeURIComponent(username)}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surfaceAlt"
            title="Seu perfil público"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 40) % 360} 55% 28%))` }}
            >
              {username.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-semibold">@{username}</span>
              <span className="block text-[9px] text-muted">ver perfil</span>
            </span>
          </Link>
          <Link
            href="/settings"
            title="Configurações"
            className={`rounded-lg p-1.5 text-sm transition-colors ${
              pathname.startsWith("/settings") ? "bg-accent/15 text-accent" : "text-muted hover:bg-surfaceAlt hover:text-white"
            }`}
          >⚙️</Link>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            title="Sair"
            className="rounded-lg p-1.5 text-sm text-muted transition-colors hover:bg-danger/15 hover:text-danger"
          >⏻</button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/70 bg-surface/60 backdrop-blur lg:flex">
        {sidebarContent}
      </aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/90 px-3 py-2.5 backdrop-blur lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-lg"
        >☰</button>
        <Link href="/lobby" className="flex items-center gap-1.5 text-sm font-extrabold">
          <span className="text-lg text-accent">♞</span> Xadrez <span className="text-accent">Arena</span>
        </Link>
        <Link
          href="/wallet"
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-accent"
          aria-label="Carteira"
        >
          {formatCoins(balance)}<span className="text-[9px] font-normal text-muted">c</span>
        </Link>
      </header>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Conteúdo */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
