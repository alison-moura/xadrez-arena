"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isMuted, setMuted, getPack, setPack, play as playSound, type SoundPack } from "@/lib/sounds";
import { ANIM_SPEED_OPTIONS, type AnimSpeed } from "@/lib/board-prefs";

type NotifPerm = "default" | "granted" | "denied" | "unsupported";

export function SettingsClient() {
  const [muted, setMutedState] = useState(false);
  const [pack, setPackState] = useState<SoundPack>("classic");
  const [notif, setNotif] = useState<NotifPerm>("default");
  const [highlightLegal, setHighlightLegal] = useState(true);
  const [autoPromote, setAutoPromote] = useState(false);
  const [showNotation, setShowNotation] = useState(true);
  const [animSpeed, setAnimSpeed] = useState<AnimSpeed>("normal");

  useEffect(() => {
    setMutedState(isMuted());
    setPackState(getPack());
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotif("unsupported");
    } else {
      setNotif(Notification.permission as NotifPerm);
    }
    try {
      setHighlightLegal(localStorage.getItem("xa.highlightLegal") !== "0");
      setAutoPromote(localStorage.getItem("xa.autoPromote") === "1");
      setShowNotation(localStorage.getItem("xa.showNotation") !== "0");
      const a = localStorage.getItem("xa.animSpeed") as AnimSpeed | null;
      if (a) setAnimSpeed(a);
    } catch { /* ignore */ }
  }, []);

  function pickPack(p: SoundPack) {
    setPack(p);
    setPackState(p);
    if (!muted) playSound("notify");
  }

  function toggleMute() {
    const v = !muted;
    setMuted(v);
    setMutedState(v);
    if (!v) playSound("click");
  }

  async function requestNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotif(perm as NotifPerm);
    if (perm === "granted") {
      new Notification("Xadrez Arena", { body: "Notificações ativadas!", icon: "/favicon.ico" });
    }
  }

  function toggleHighlight() {
    const v = !highlightLegal;
    setHighlightLegal(v);
    try { localStorage.setItem("xa.highlightLegal", v ? "1" : "0"); } catch { /* ignore */ }
  }

  function toggleAutoPromote() {
    const v = !autoPromote;
    setAutoPromote(v);
    try { localStorage.setItem("xa.autoPromote", v ? "1" : "0"); } catch { /* ignore */ }
  }

  function toggleNotation() {
    const v = !showNotation;
    setShowNotation(v);
    try { localStorage.setItem("xa.showNotation", v ? "1" : "0"); } catch { /* ignore */ }
  }

  function pickAnimSpeed(v: AnimSpeed) {
    setAnimSpeed(v);
    try { localStorage.setItem("xa.animSpeed", v); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-xs text-muted">Preferências locais, salvas no navegador.</p>
        </div>
        <Link href="/lobby" className="btn-secondary text-xs">← Lobby</Link>
      </div>

      {/* Som */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Som</h2>
        <ToggleRow
          label="Efeitos sonoros"
          desc="Movimento, captura, xeque, fim de partida. Atalho: M."
          checked={!muted}
          onChange={toggleMute}
        />
        {!muted && (
          <div>
            <div className="mb-2 text-xs text-muted">Pack de sons</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { v: "classic" as const, label: "Clássico", emoji: "🎵" },
                { v: "futuristic" as const, label: "Futurista", emoji: "🛸" },
                { v: "soft" as const, label: "Suave", emoji: "🌿" },
              ]).map((p) => (
                <button
                  key={p.v}
                  onClick={() => pickPack(p.v)}
                  className={`rounded-lg border py-2 text-xs transition-colors ${
                    pack === p.v
                      ? "border-accent bg-accent text-black font-medium"
                      : "border-border text-muted hover:border-accent/40 hover:text-white"
                  }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notificações */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Notificações</h2>
        {notif === "unsupported" ? (
          <p className="text-xs text-muted">Seu navegador não suporta notificações.</p>
        ) : notif === "granted" ? (
          <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
            ✓ Notificações ativadas
          </div>
        ) : notif === "denied" ? (
          <p className="text-xs text-danger">
            Você bloqueou notificações. Abra as configurações do navegador para permitir.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Permita notificações pra ser avisado quando for sua vez de jogar enquanto está em outra aba.
            </p>
            <button onClick={requestNotifications} className="btn-primary text-sm">
              Permitir notificações
            </button>
          </>
        )}
      </div>

      {/* Tabuleiro */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Tabuleiro</h2>
        <ToggleRow
          label="Destacar lances legais"
          desc="Mostra bolinhas douradas nas casas válidas ao selecionar uma peça."
          checked={highlightLegal}
          onChange={toggleHighlight}
        />
        <ToggleRow
          label="Auto-promover pra rainha"
          desc="Promove automaticamente sem perguntar Q/R/B/C."
          checked={autoPromote}
          onChange={toggleAutoPromote}
        />
        <ToggleRow
          label="Coordenadas no tabuleiro"
          desc="Exibe a-h e 1-8 nas bordas das casas."
          checked={showNotation}
          onChange={toggleNotation}
        />
        <div>
          <div className="mb-1.5 text-sm font-medium">Velocidade da animação</div>
          <div className="grid grid-cols-4 gap-1.5">
            {ANIM_SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => pickAnimSpeed(opt.value)}
                className={`rounded-lg border py-1.5 text-[11px] transition-colors ${
                  animSpeed === opt.value
                    ? "border-accent bg-accent text-black font-medium"
                    : "border-border text-muted hover:border-accent/40 hover:text-white"
                }`}
              >{opt.label}</button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted">Afeta o deslizar das peças no tabuleiro.</p>
        </div>
      </div>

      {/* Backup / Restore */}
      <BackupRestoreCard />

      {/* Atalhos */}
      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Atalhos de teclado</h2>
        <ul className="space-y-1 text-xs">
          {[
            ["← →", "Navegar pelos lances"],
            ["↑ Home", "Ir pro início"],
            ["↓ End", "Voltar pro lance atual"],
            ["F", "Inverter tabuleiro"],
            ["M", "Mute / unmute"],
            ["Esc", "Limpar marcações, setas e pré-lance"],
            ["Right-click", "Marcar casa (cicla cores)"],
            ["Right-click drag", "Desenhar seta"],
          ].map(([k, d]) => (
            <li key={k} className="flex gap-3">
              <kbd className="shrink-0 w-28 rounded border border-border bg-surfaceAlt px-2 py-0.5 font-mono text-[10px] text-white">{k}</kbd>
              <span className="text-muted">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BackupRestoreCard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function collectXaKeys(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("xa.")) continue;
        const v = localStorage.getItem(k);
        if (v !== null) out[k] = v;
      }
    } catch { /* ignore */ }
    return out;
  }

  function exportPrefs() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: collectXaKeys(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `xadrez-arena-prefs-${d}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ kind: "ok", text: `Exportado ${Object.keys(payload.data).length} chaves.` });
  }

  function importPrefs() {
    fileInputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json?.data || typeof json.data !== "object") {
        setMsg({ kind: "err", text: "Arquivo inválido: faltando campo 'data'." });
        return;
      }
      let count = 0;
      for (const [k, v] of Object.entries(json.data)) {
        if (!k.startsWith("xa.")) continue;
        if (typeof v !== "string") continue;
        localStorage.setItem(k, v);
        count++;
      }
      setMsg({ kind: "ok", text: `${count} chaves importadas. Recarregando…` });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMsg({ kind: "err", text: `Falha ao ler: ${(err as Error).message}` });
    } finally {
      // Permitir re-seleção do mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Backup local</h2>
      <p className="text-xs text-muted">
        Exporte ou restaure suas preferências (som, tabuleiro, anotações, puzzles, favoritos).
        Tudo o que está em <code className="text-accent">localStorage</code> sob o prefixo <code className="text-accent">xa.*</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportPrefs} className="btn-secondary py-1.5 text-xs">⬇️ Exportar JSON</button>
        <button onClick={importPrefs} className="btn-secondary py-1.5 text-xs">⬆️ Importar JSON</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFile}
        />
      </div>
      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-[10px] text-muted">{desc}</div>}
      </div>
      <span
        className={`relative inline-block h-6 w-11 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surfaceAlt border border-border"}`}
        onClick={onChange}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </span>
    </label>
  );
}
