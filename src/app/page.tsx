import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/lobby");

  // Stats públicos pra dar credibilidade ao topo
  const [{ count: userCount }, { count: matchCount }] = await Promise.all([
    supabase.from("chess_users").select("*", { count: "exact", head: true }).eq("is_bot", false).is("banned_at", null),
    supabase.from("chess_matches").select("*", { count: "exact", head: true }).eq("status", "FINISHED"),
  ]);
  const { data: topPlayers } = await supabase
    .from("chess_users")
    .select("username, rating")
    .eq("is_bot", false)
    .is("banned_at", null)
    .order("rating", { ascending: false })
    .limit(3);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accentDark text-xl text-black shadow-md shadow-accent/20">♞</span>
            <span className="text-lg font-extrabold tracking-tight">Xadrez <span className="text-accent">Arena</span></span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary py-1.5 text-sm">Entrar</Link>
            <Link href="/register" className="btn-primary py-1.5 text-sm">Criar conta grátis</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(245,179,1,0.10),transparent_40%),radial-gradient(circle_at_75%_75%,rgba(120,80,220,0.10),transparent_40%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
          <span className="badge-accent mb-6 inline-flex items-center gap-1.5 px-3 py-1 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            +1.000 coins de bônus ao se cadastrar
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Jogue xadrez.{" "}
            <span className="text-accent">Aposte.</span>
            <br />
            Leve o pote.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted md:text-lg">
            Plataforma completa de xadrez multiplayer: apostas em coins, ratings por categoria, torneios ao vivo, puzzles, análise por Stockfish e skins colecionáveis.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 md:flex-row">
            <Link href="/register" className="btn-primary px-8 py-3 text-base">Começar agora — é grátis</Link>
            <Link href="/login" className="btn-secondary px-8 py-3 text-base">Já tenho conta</Link>
          </div>

          {/* Stats */}
          <div className="mt-12 grid gap-3 mx-auto max-w-xl grid-cols-3">
            <Stat label="Jogadores" value={userCount?.toLocaleString("pt-BR") ?? "—"} />
            <Stat label="Partidas" value={matchCount?.toLocaleString("pt-BR") ?? "—"} />
            <Stat label="Top rating" value={topPlayers?.[0]?.rating?.toString() ?? "—"} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="mb-6 text-center text-2xl font-bold">O que tem por aqui</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: "⚡", title: "Quick Match",             text: "Encontre um oponente do seu nível com 1 clique. Bullet, blitz, rápido ou clássico — 9 ritmos de jogo." },
            { icon: "💰", title: "Apostas em escrow",       text: "O pote fica travado com segurança durante a partida. Vencedor leva, empate devolve tudo." },
            { icon: "🥇", title: "Ratings por categoria",   text: "Elo separado pra Bullet, Blitz e Rápido, como nos grandes sites. Ranking com abas por ritmo." },
            { icon: "⚔️", title: "Desafios diretos",        text: "Desafie qualquer jogador pelo perfil. O convite chega no lobby dele com aceitar/recusar." },
            { icon: "🧩", title: "Puzzle do Dia + Rush",    text: "Tática diária com streak e o modo Rush: resolva o máximo em 5 minutos com 3 vidas." },
            { icon: "🏆", title: "Torneios arena",          text: "Pontue dentro da janela de tempo com countdown ao vivo. Prêmio dividido entre o top 3." },
            { icon: "📈", title: "Análise com Stockfish",   text: "Accuracy, erros e blunders lance a lance + gráfico de vantagem clicável após cada partida." },
            { icon: "📖", title: "Aberturas + coach",       text: "Explorador de aberturas interativo e dica do coach nas partidas de treino contra o bot." },
            { icon: "🎨", title: "Skins e mercado",         text: "Tabuleiros e peças colecionáveis: drops por partida, loja e mercado de trocas entre jogadores." },
          ].map((c) => (
            <div key={c.title} className="card transition-colors hover:border-accent/30">
              <div className="text-2xl">{c.icon}</div>
              <h3 className="mt-3 text-sm font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Top players */}
      {topPlayers && topPlayers.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <h2 className="mb-4 text-center text-xl font-bold">🏅 Top jogadores agora</h2>
          <div className="card flex flex-col gap-2">
            {topPlayers.map((p, i) => (
              <div key={p.username} className="flex items-center justify-between border-b border-border last:border-b-0 py-2 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className={`w-6 text-center font-mono ${i === 0 ? "text-accent text-lg" : "text-muted"}`}>
                    {i + 1}
                  </span>
                  <span className="font-semibold">@{p.username}</span>
                </div>
                <span className="font-mono text-sm text-accent">{p.rating}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA bottom */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">Pronto para sua primeira partida?</h2>
          <p className="mt-3 text-muted">
            Cadastre-se grátis, ganhe 1.000 coins de bônus e comece a jogar agora.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 px-3 py-3 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-accent">{value}</div>
    </div>
  );
}
