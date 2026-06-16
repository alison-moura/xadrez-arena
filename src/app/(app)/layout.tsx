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

  const { data: wallet } = await supabase
    .from("chess_wallets")
    .select("balance, locked")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const balance = wallet?.balance ?? 0;
  const locked = wallet?.locked ?? 0;

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
              <NavLinks />
            </nav>
          </div>
          <div className="flex items-center gap-3">
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
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
          <NavLinks mobile />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
