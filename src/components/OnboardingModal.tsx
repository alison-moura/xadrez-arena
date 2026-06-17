"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "xa.onboarded.v1";

type Step = {
  emoji: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    emoji: "♞",
    title: "Bem-vindo à Xadrez Arena",
    body:
      "Plataforma multiplayer com sistema de apostas em coins. Você começou com 1000 coins de boas-vindas — use pra entrar em partidas ou treinar grátis vs bot.",
  },
  {
    emoji: "⚡",
    title: "Pra jogar agora",
    body:
      "Use o botão Quick Match na direita pra cair em qualquer partida com sua aposta e tempo. Pra mais controle, crie uma manual com cor, rating range e tempo personalizado.",
  },
  {
    emoji: "🧩",
    title: "Treine e acompanhe",
    body:
      "Resolva o Puzzle do Dia pra manter sua sequência. Veja seu progresso e horário ativo em /stats. Configure som, animação e atalhos em /settings.",
  },
];

export function OnboardingModal() {
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setShown(true);
    } catch { /* ignore */ }
  }, []);

  function close() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setShown(false);
  }

  function next() {
    if (step >= STEPS.length - 1) close();
    else setStep((s) => s + 1);
  }

  if (!shown) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <button
          onClick={close}
          aria-label="Pular tour"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surfaceAlt text-muted transition-colors hover:border-danger/40 hover:text-danger"
        >×</button>

        <div className="text-center">
          <div className="text-5xl">{s.emoji}</div>
          <h2 className="mt-3 text-xl font-bold">{s.title}</h2>
          <p className="mt-2 text-sm text-muted">{s.body}</p>
        </div>

        {/* Progress dots */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-surfaceAlt"}`}
            />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={close} className="btn-secondary">
            Pular
          </button>
          <button onClick={next} className="btn-primary">
            {isLast ? "Começar 🎯" : "Próximo →"}
          </button>
        </div>
      </div>
    </div>
  );
}
