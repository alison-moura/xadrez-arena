import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCoins } from "@/lib/utils";
import { LogoutButton } from "@/components/LogoutButton";
import { NavLinks } from "@/components/NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [{ data: wallet }, { data: me }] = await Promise.all([
    supabase
      .from("chess_wallets")
      .select("balance, locked")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .from("chess_users")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle(),
  ]);

  // Heartbeat de presença (atualiza last_seen_at). Não bloqueante.
  void supabase
    .from("chess_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.user.id);

  const balance = wallet?.balance ?? 0;
  const locked = wallet?.locked ?? 0;
  const isAdmin = !!me?.is_admin;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-5">
            <Link href="/lobby" className="flex items-center gap-2 text-lg font-bold">
              <span className="text-accent">♞</span>
              <span>Xadrez Arena</span>
            </Link>
            <nav className="hidden gap-1 md:flex">
              <NavLinks isAdmin={isAdmin} />
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Saldo compacto no mobile */}
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs transition-colors hover:border-accent/40 md:hidden"
              aria-label="Saldo da carteira"
            >
              <span className="font-semibold text-accent">{formatCoins(balance)}</span>
              <span className="text-[9px] text-muted">c</span>
            </Link>
            <Link
              href="/wallet"
              className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent/40 md:inline-flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="font-semibold text-accent">{formatCoins(balance)}</span>
              <span className="text-xs text-muted">coins</span>
              {locked > 0 && (
                <span className="ml-1 rounded bg-surfaceAlt px-1.5 py-0.5 text-[10px] text-muted">
                  🔒 {formatCoins(locked)}
                </span>
              )}
            </Link>
            <span className="hidden text-sm text-muted md:inline">
              @{session.user.name}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="scrollbar-thin relative flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
          <NavLinks mobile isAdmin={isAdmin} />
          <div className="pointer-events-none sticky right-0 top-0 h-full w-8 shrink-0 bg-gradient-to-l from-background to-transparent" aria-hidden />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
