"use client";
import { useCallback, useEffect, useState } from "react";
import { formatCoins, formatDate } from "@/lib/utils";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  destination: string;
  status: Status;
  note: string | null;
  created_at: string;
  updated_at: string;
  user: { id: string; username: string; email: string } | null;
};

const TABS: { value: Status; label: string }[] = [
  { value: "PENDING",  label: "Pendentes" },
  { value: "APPROVED", label: "Aprovados" },
  { value: "PAID",     label: "Pagos" },
  { value: "REJECTED", label: "Rejeitados" },
];

export function AdminWithdrawalsClient() {
  const [tab, setTab] = useState<Status>("PENDING");
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals?status=${tab}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setItems(data.withdrawals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "approve" | "reject" | "paid") {
    let note: string | undefined;
    if (action === "reject") {
      const n = prompt("Motivo da rejeição (opcional):") ?? "";
      note = n.trim() || undefined;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin · Saques</h1>
        <p className="text-xs text-muted">Aprove ou rejeite pedidos de saque. Rejeição devolve as coins ao usuário.</p>
      </div>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              tab === t.value
                ? "border-accent bg-accent text-black font-medium"
                : "border-border text-muted hover:border-accent/40 hover:text-white"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="card py-6 text-center text-sm text-muted">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="card py-6 text-center text-sm text-muted">Nenhum item.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((w) => (
            <li key={w.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">@{w.user?.username ?? "?"}</span>
                  <span className="text-muted">·</span>
                  <span className="font-mono text-accent">{formatCoins(w.amount)} coins</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  Via <span className="text-white">{w.method}</span> → <span className="font-mono text-white">{w.destination}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted">
                  {formatDate(w.created_at)} {w.note && <span> · nota: {w.note}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {w.status === "PENDING" && (
                  <>
                    <button onClick={() => act(w.id, "approve")} disabled={busy === w.id} className="btn-primary py-1.5 text-xs">Aprovar</button>
                    <button onClick={() => act(w.id, "reject")} disabled={busy === w.id} className="btn-danger py-1.5 text-xs">Rejeitar</button>
                  </>
                )}
                {w.status === "APPROVED" && (
                  <button onClick={() => act(w.id, "paid")} disabled={busy === w.id} className="btn-secondary py-1.5 text-xs">Marcar como pago</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
