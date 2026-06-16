import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/lobby");

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">♞</span>
            <span className="text-lg font-bold">Xadrez Arena</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary">
              Criar conta grátis
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="badge-accent mb-6 inline-block">+1000 coins de bônus ao se cadastrar</span>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          Jogue xadrez. <span className="text-accent">Aposte.</span> Leve o pote.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Crie partidas com a aposta que quiser, desafie outros jogadores em tempo real
          e ganhe coins a cada vitória. Saque quando quiser.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 md:flex-row">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            Começar agora
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            Já tenho conta
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: "♟",
              title: "Multiplayer real",
              text: "Partidas em tempo real com validação server-side em cada lance. Justo para todo mundo.",
            },
            {
              icon: "💰",
              title: "Aposte coins",
              text: "Defina o valor da aposta na criação. O pote vai pra escrow e é pago ao vencedor automaticamente.",
            },
            {
              icon: "🏆",
              title: "Leaderboard + saque",
              text: "Suba no ranking e saque seus coins via PIX, USDT ou outros métodos quando quiser.",
            },
          ].map((c) => (
            <div key={c.title} className="card">
              <div className="text-3xl">{c.icon}</div>
              <h3 className="mt-3 text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} Xadrez Arena. Jogue com responsabilidade.
      </footer>
    </main>
  );
}
