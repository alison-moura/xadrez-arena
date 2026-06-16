import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateWallet } from "@/lib/wallet";
import { formatCoins } from "@/lib/utils";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const wallet = await getOrCreateWallet(session.user.id);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/lobby" className="flex items-center gap-2 text-lg font-bold">
              <span>♞</span>
              <span>Xadrez Arena</span>
            </Link>
            <nav className="hidden gap-1 text-sm text-muted md:flex">
              <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/lobby">
                Lobby
              </Link>
              <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/history">
                Histórico
              </Link>
              <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/leaderboard">
                Ranking
              </Link>
              <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/wallet">
                Carteira
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/wallet"
              className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm md:inline-flex"
            >
              <span className="text-accent">●</span>
              <span className="font-semibold">{formatCoins(wallet.balance)}</span>
              <span className="text-xs text-muted">coins</span>
              {wallet.locked > 0 && (
                <span className="ml-1 rounded bg-surfaceAlt px-1.5 py-0.5 text-[10px] text-muted">
                  🔒 {formatCoins(wallet.locked)}
                </span>
              )}
            </Link>
            <span className="hidden text-sm text-muted md:inline">
              @{session.user.name}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 text-sm text-muted md:hidden">
          <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/lobby">
            Lobby
          </Link>
          <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/history">
            Histórico
          </Link>
          <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/leaderboard">
            Ranking
          </Link>
          <Link className="rounded px-3 py-1 hover:bg-surface hover:text-white" href="/wallet">
            Carteira
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
