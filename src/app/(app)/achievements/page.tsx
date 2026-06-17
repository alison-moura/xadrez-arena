"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  reward_coins: number;
  sort_order: number;
  earned: boolean;
  earned_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  partidas:  "Partidas",
  xadrez:    "Xadrez",
  bot:       "Bot",
  rating:    "Rating",
  apostas:   "Apostas",
  overwatch: "Overwatch",
};

const CATEGORY_ICONS: Record<string, string> = {
  partidas:  "♟",
  xadrez:    "♔",
  bot:       "🤖",
  rating:    "📈",
  apostas:   "💰",
  overwatch: "⚖️",
};

export const dynamic = "force-dynamic";

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/achievements")
      .then((r) => r.json())
      .then((d) => {
        setAchievements(d.achievements ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = Array.from(new Set(achievements.map((a) => a.category)));
  const filtered = filter === "all" ? achievements : achievements.filter((a) => a.category === filter);
  const earned = achievements.filter((a) => a.earned).length;
  const total = achievements.length;

  const catStats = categories.map((cat) => {
    const inCat = achievements.filter((a) => a.category === cat);
    const earnedInCat = inCat.filter((a) => a.earned).length;
    return { cat, earned: earnedInCat, total: inCat.length, pct: inCat.length ? Math.round((earnedInCat / inCat.length) * 100) : 0 };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        Carregando conquistas…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conquistas</h1>
          <p className="mt-1 text-sm text-muted">
            {earned}/{total} desbloqueadas •{" "}
            <span className="text-accent">
              {achievements.filter((a) => a.earned).reduce((s, a) => s + a.reward_coins, 0)} coins ganhos
            </span>
          </p>
        </div>
        <Link href="/lobby" className="btn-secondary text-sm">
          ← Lobby
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surfaceAlt">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${total > 0 ? (earned / total) * 100 : 0}%` }}
        />
      </div>

      {/* Per-category mini progress */}
      {catStats.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catStats.map((s) => (
            <div key={s.cat} className="card py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {CATEGORY_ICONS[s.cat]} {CATEGORY_LABELS[s.cat] ?? s.cat}
                </span>
                <span className="text-[10px] text-muted">{s.earned}/{s.total}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surfaceAlt">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${s.pct === 100 ? "bg-success" : "bg-accent"}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
              <div className="mt-0.5 text-right text-[10px] text-muted">{s.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            filter === "all"
              ? "border-accent bg-accent text-black font-medium"
              : "border-border text-muted hover:border-accent/50 hover:text-white"
          }`}
        >
          Todas
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filter === cat
                ? "border-accent bg-accent text-black font-medium"
                : "border-border text-muted hover:border-accent/50 hover:text-white"
            }`}
          >
            {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Achievement grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div
            key={a.id}
            className={`card relative flex items-start gap-3 transition-all ${
              a.earned
                ? "border-accent/30 bg-surface"
                : "opacity-50 grayscale"
            }`}
          >
            {a.earned && (
              <div className="absolute right-3 top-3 text-[10px] font-medium text-success">
                ✓ Conquistado
              </div>
            )}
            <div className="mt-0.5 text-3xl">{a.icon}</div>
            <div className="flex-1">
              <div className="font-semibold">{a.name}</div>
              <div className="mt-0.5 text-xs text-muted">{a.description}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="badge text-[10px]">{CATEGORY_LABELS[a.category] ?? a.category}</span>
                {a.reward_coins > 0 && (
                  <span className="text-[10px] text-accent">+{a.reward_coins} coins</span>
                )}
              </div>
              {a.earned && a.earned_at && (
                <div className="mt-1 text-[10px] text-muted">
                  {new Date(a.earned_at).toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card py-10 text-center text-muted">
          Nenhuma conquista nesta categoria ainda.
        </div>
      )}
    </div>
  );
}
