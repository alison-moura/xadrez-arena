"use client";
import { useCallback, useEffect, useState } from "react";
import { formatCoins, formatDate } from "@/lib/utils";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

type Wallet = { balance: number; locked: number };

type Withdrawal = {
  id: string;
  amount: number;
  method: string;
  destination: string;
  status: string;
  createdAt?: string;
  created_at?: string;
};

const TX_FILTERS: { value: string | null; label: string; emoji: string }[] = [
  { value: null,             label: "Todas",        emoji: "•" },
  { value: "WAGER_WIN",      label: "Vitórias",     emoji: "🏆" },
  { value: "WAGER_LOSS",     label: "Derrotas",     emoji: "💀" },
  { value: "WAGER_REFUND",   label: "Reembolsos",   emoji: "↩" },
  { value: "WAGER_LOCK",     label: "Escrow",       emoji: "🔒" },
  { value: "DEPOSIT",        label: "Depósitos",    emoji: "💰" },
  { value: "WITHDRAWAL",     label: "Saques",       emoji: "🏦" },
  { value: "ACHIEVEMENT",    label: "Conquistas",   emoji: "🏅" },
  { value: "SKIN_PURCHASE",  label: "Skins",        emoji: "🎨" },
];

export function WalletClient() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const [depositValue, setDepositValue] = useState(100);
  const [withdrawValue, setWithdrawValue] = useState(100);
  const [method, setMethod] = useState("PIX");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const PAGE = 25;

  const loadFiltered = useCallback(async (offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (filter) params.set("type", filter);
    const res = await fetch(`/api/wallet?${params.toString()}`);
    if (!res.ok) return null;
    return res.json();
  }, [filter]);

  const load = useCallback(async () => {
    const [w, wd] = await Promise.all([
      loadFiltered(0),
      fetch("/api/wallet/withdraw").then((r) => r.json()),
    ]);
    if (w) {
      setWallet(w.wallet);
      setTxs(w.transactions);
      setTotal(w.total ?? 0);
    }
    setWithdrawals(wd.withdrawals ?? []);
  }, [loadFiltered]);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    const d = await loadFiltered(txs.length);
    if (d?.transactions) setTxs((prev) => [...prev, ...d.transactions]);
    setLoadingMore(false);
  }

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: depositValue }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "Erro" }); return; }
    setMsg({ type: "ok", text: `Depósito de ${formatCoins(depositValue)} confirmado!` });
    await load();
  }

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: withdrawValue, method, destination }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "Erro" }); return; }
    setMsg({ type: "ok", text: `Saque de ${formatCoins(withdrawValue)} solicitado. Aguarde aprovação.` });
    setDestination("");
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="card">
          <h2 className="text-xs uppercase tracking-wider text-muted">Saldo disponível</h2>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-4xl font-bold text-accent">{wallet ? formatCoins(wallet.balance) : "—"}</div>
            <div className="text-sm text-muted">coins</div>
          </div>
          {wallet && wallet.locked > 0 && (
            <div className="mt-2 text-sm text-muted">
              🔒 {formatCoins(wallet.locked)} coins em escrow (apostas ativas)
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Histórico</h3>
            <div className="text-xs text-muted">{txs.length} de {total}</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TX_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setFilter(f.value)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === f.value
                    ? "border-accent bg-accent text-black font-medium"
                    : "border-border text-muted hover:border-accent/40 hover:text-white"
                }`}
              >{f.emoji} {f.label}</button>
            ))}
          </div>
          {txs.length === 0 ? (
            <p className="text-sm text-muted">Sem transações com esse filtro.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {txs.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{txLabel(t.type)}</div>
                      <div className="text-xs text-muted">
                        {formatDate(t.created_at)} {t.note ? `• ${t.note}` : ""}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${t.amount >= 0 ? "text-success" : "text-danger"}`}>
                      {t.amount >= 0 ? "+" : ""}{formatCoins(t.amount)}
                    </div>
                  </li>
                ))}
              </ul>
              {txs.length < total && (
                <div className="mt-3 text-center">
                  <button onClick={loadMore} disabled={loadingMore} className="btn-secondary text-xs">
                    {loadingMore ? "Carregando…" : "Carregar mais"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 text-lg font-semibold">Saques solicitados</h3>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted">Nenhum saque solicitado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{formatCoins(w.amount)} coins — {w.method}</div>
                    <div className="text-xs text-muted">
                      {formatDate(w.createdAt ?? w.created_at ?? "")} • {w.destination}
                    </div>
                  </div>
                  <span className={
                    w.status === "PAID" ? "badge-success" :
                    w.status === "REJECTED" ? "badge-danger" : "badge"
                  }>{w.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-semibold">Depositar</h3>
          <p className="mt-1 text-xs text-muted">(Sandbox) — em produção, integração com gateway real.</p>
          <form onSubmit={deposit} className="mt-4 space-y-3">
            <div>
              <label className="label">Valor (coins)</label>
              <input
                type="number" min={1} className="input"
                value={depositValue}
                onChange={(e) => setDepositValue(Math.max(1, Number(e.target.value)))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[100, 500, 1000, 5000].map((v) => (
                  <button type="button" key={v} onClick={() => setDepositValue(v)}
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-white">
                    {formatCoins(v)}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">Depositar</button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold">Sacar</h3>
          <p className="mt-1 text-xs text-muted">Valor mínimo: 100 coins. Saque processado em até 24h.</p>
          <form onSubmit={withdraw} className="mt-4 space-y-3">
            <div>
              <label className="label">Valor (coins)</label>
              <input
                type="number" min={100} className="input"
                value={withdrawValue}
                onChange={(e) => setWithdrawValue(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="label">Método</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="PIX">PIX</option>
                <option value="USDT">USDT (TRC20)</option>
                <option value="BTC">Bitcoin</option>
                <option value="BANK">Transferência bancária</option>
              </select>
            </div>
            <div>
              <label className="label">Destino (chave / endereço)</label>
              <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)}
                placeholder="chave PIX, endereço carteira, etc" required />
            </div>
            <button type="submit" disabled={busy} className="btn-secondary w-full">Solicitar saque</button>
          </form>
        </div>

        {msg && (
          <div className={`card text-sm ${msg.type === "ok" ? "text-success" : "text-danger"}`}>
            {msg.text}
          </div>
        )}
      </aside>
    </div>
  );
}

function txLabel(t: string): string {
  switch (t) {
    case "DEPOSIT":       return "Depósito";
    case "WITHDRAWAL":    return "Saque";
    case "WAGER_LOCK":    return "Aposta em escrow";
    case "WAGER_REFUND":  return "Reembolso de aposta";
    case "WAGER_WIN":     return "Prêmio recebido";
    case "WAGER_LOSS":    return "Aposta perdida";
    case "ADJUSTMENT":    return "Ajuste";
    case "ACHIEVEMENT":   return "Conquista";
    case "SKIN_PURCHASE": return "Compra de skin";
    case "SKIN_DROP":     return "Drop de skin";
    case "MARKET_BUY":    return "Compra no mercado";
    case "MARKET_SELL":   return "Venda no mercado";
    default: return t;
  }
}
