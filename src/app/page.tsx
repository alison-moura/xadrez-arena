import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/lobby");

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl text-accent">♞</span>
            <span className="text-lg font-bold">Xadrez Arena</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary py-1.5 text-sm">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary py-1.5 text-sm">
              Criar conta grátis
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <span className="badge-accent mb-6 inline-flex items-center gap-1.5 px-3 py-1 text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          +1 000 coins de bônus ao se cadastrar
        </span>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Jogue xadrez.{" "}
          <span className="text-accent">Aposte.</span>
          <br />
          Leve o pote.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted md:text-lg">
          Plataforma de xadrez multiplayer com sistema de apostas em coins.
          Crie partidas, desafie outros jogadores e ganhe a cada vitória.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 md:flex-row">
          <Link href="/register" className="btn-primary px-8 py-3 text-base">
            Começar agora — é grátis
          </Link>
          <Link href="/login" className="btn-secondary px-8 py-3 text-base">
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: "♟",
              title: "Multiplayer em tempo real",
              text: "Lance validado server-side com chess.js. Polling de 1.5s garante sincronização sem WebSocket.",
            },
            {
              icon: "💰",
              title: "Escrow automático",
              text: "Aposta trancada no momento que ambos confirmam. Vencedor recebe o pote automaticamente, com 5% de rake.",
            },
            {
              icon: "🤖",
              title: "Treine contra o Bot",
              text: "Bot com 3 dificuldades (minimax + alpha-beta). Sem aposta, sem rating. Pratique antes de apostar.",
            },
            {
              icon: "🏆",
              title: "Ranking e histórico",
              text: "Rating ELO atualizado a cada partida. Leaderboard público com top 20 jogadores.",
            },
            {
              icon: "💳",
              title: "Carteira integrada",
              text: "Depósitos sandbox e saques via PIX, USDT, BTC ou transferência bancária.",
            },
            {
              icon: "🔒",
              title: "Seguro e justo",
              text: "Operações atômicas em PL/pgSQL. Sem double-spend, sem cheating server-side.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="card transition-colors hover:border-accent/30"
            >
              <div className="text-2xl">{c.icon}</div>
              <h3 className="mt-3 text-sm font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">
            Pronto para sua primeira partida?
          </h2>
          <p className="mt-3 text-muted">
            Cadastre-se grátis, ganhe 1000 coins de bônus e comece a jogar agora.
          </p>
          <Link href="/register" className="btn-primary mt-6 inline-flex px-8 py-3 text-base">
            Criar conta grátis
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} Xadrez Arena — Jogue com responsabilidade.
      </footer>
    </main>
  );
}
