"use client";
import { useEffect, useRef, useState } from "react";

const KEY_PREFIX = "xa.matchNote.";
const MAX_LEN = 2000;

export function MatchNoteCard({ matchId }: { matchId: string }) {
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + matchId);
      if (raw) {
        const parsed = JSON.parse(raw);
        setNote(parsed.text ?? "");
        setSavedAt(parsed.savedAt ?? null);
        if (parsed.text) setExpanded(true);
      }
    } catch { /* ignore */ }
    loadedRef.current = true;
  }, [matchId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        if (note.trim() === "") {
          localStorage.removeItem(KEY_PREFIX + matchId);
          setSavedAt(null);
        } else {
          const payload = { text: note.slice(0, MAX_LEN), savedAt: Date.now() };
          localStorage.setItem(KEY_PREFIX + matchId, JSON.stringify(payload));
          setSavedAt(payload.savedAt);
        }
      } catch { /* ignore */ }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [note, matchId]);

  const charCount = note.length;
  const lastSavedLabel = savedAt
    ? new Date(savedAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          📝 Anotação privada
        </h3>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-muted hover:text-white"
        >
          {expanded ? "ocultar" : note ? "mostrar" : "+ adicionar"}
        </button>
      </div>
      {expanded && (
        <>
          <textarea
            value={note}
            maxLength={MAX_LEN}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Suas observações sobre esta partida — só você vê (salvo no navegador)."
            className="mt-2 w-full min-h-[80px] rounded-lg border border-border bg-surfaceAlt px-2 py-1.5 text-xs text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
            <span>{charCount}/{MAX_LEN}</span>
            {lastSavedLabel && <span>Salvo {lastSavedLabel}</span>}
          </div>
        </>
      )}
      {!expanded && !note && (
        <p className="mt-1 text-[10px] text-muted">Adicione observações pra revisar depois.</p>
      )}
      {!expanded && note && (
        <p className="mt-1 line-clamp-2 text-[11px] text-muted/80">{note}</p>
      )}
    </div>
  );
}
