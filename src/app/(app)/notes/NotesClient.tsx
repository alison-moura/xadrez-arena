"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Note {
  matchId: string;
  text: string;
  savedAt: number;
}

const KEY_PREFIX = "xa.matchNote.";

function loadAllNotes(): Note[] {
  if (typeof window === "undefined") return [];
  const out: Note[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { text?: string; savedAt?: number };
        if (parsed?.text) {
          out.push({
            matchId: key.slice(KEY_PREFIX.length),
            text:    parsed.text,
            savedAt: parsed.savedAt ?? 0,
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

function fmtWhen(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function NotesClient() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => setNotes(loadAllNotes()), []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    if (!notes) return [];
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      n.text.toLowerCase().includes(q) || n.matchId.toLowerCase().includes(q),
    );
  }, [notes, search]);

  function deleteNote(matchId: string) {
    if (!confirm("Apagar esta anotação? Não tem como recuperar.")) return;
    try { localStorage.removeItem(KEY_PREFIX + matchId); } catch { /* ignore */ }
    refresh();
  }

  function clearAll() {
    if (!confirm(`Apagar todas as ${notes?.length ?? 0} anotações? Não tem como recuperar.`)) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch { /* ignore */ }
    refresh();
  }

  if (notes === null) {
    return <div className="text-xs text-muted">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">📝 Anotações</h1>
          <p className="text-xs text-muted">
            Suas observações privadas em partidas — armazenadas no navegador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notes.length > 0 && (
            <button onClick={clearAll} className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10">
              Apagar tudo
            </button>
          )}
          <Link href="/lobby" className="btn-secondary py-1.5 text-xs">← Lobby</Link>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-muted">
          <span className="text-4xl opacity-40">📝</span>
          <p className="text-sm">Você não tem anotações ainda.</p>
          <p className="text-[11px]">
            Termine uma partida e escreva algo no card "Anotação privada" embaixo da lista de lances.
          </p>
        </div>
      ) : (
        <>
          <input
            type="search"
            placeholder="Buscar no texto ou no ID da partida…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />

          <p className="text-[11px] text-muted">
            {filtered.length} de {notes.length} anotações
          </p>

          <ul className="space-y-2">
            {filtered.map((n) => (
              <li key={n.matchId} className="card space-y-2 py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Link
                    href={`/match/${n.matchId}`}
                    className="font-mono text-muted transition-colors hover:text-accent"
                    title="Abrir partida"
                  >
                    🔗 partida {n.matchId.slice(0, 8)}…
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{fmtWhen(n.savedAt)}</span>
                    <button
                      onClick={() => deleteNote(n.matchId)}
                      className="rounded border border-border bg-surfaceAlt px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-xs text-white">{n.text}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
