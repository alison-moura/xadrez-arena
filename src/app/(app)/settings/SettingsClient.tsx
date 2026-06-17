"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { isMuted, setMuted, play as playSound } from "@/lib/sounds";

type NotifPerm = "default" | "granted" | "denied" | "unsupported";

export function SettingsClient() {
  const [muted, setMutedState] = useState(false);
  const [notif, setNotif] = useState<NotifPerm>("default");
  const [highlightLegal, setHighlightLegal] = useState(true);
  const [autoPromote, setAutoPromote] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotif("unsupported");
    } else {
      setNotif(Notification.permission as NotifPerm);
    }
    try {
      setHighlightLegal(localStorage.getItem("xa.highlightLegal") !== "0");
      setAutoPromote(localStorage.getItem("xa.autoPromote") === "1");
    } catch { /* ignore */ }
  }, []);

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
      </div>

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
