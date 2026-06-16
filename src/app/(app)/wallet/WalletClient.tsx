"use client";
import { useEffect, useState } from "react";
import { formatCoins, formatDate } from "@/lib/utils";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

type Wallet = {
  balance: number;
  locked: number;
};

type Withdrawal = {
  id: string;
  amount: number;
  method: string;
  destination: string;
  status: string;
  createdAt: string;
};

export function WalletClient() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [depositValue, setDepositValue] = useState(100);
  const [withdrawValue, setWithdrawValue] = useState(100);
  const [method, setMethod] = useState("PIX");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const [w, wd] = await Promise.all([
      fetch("/api/wallet").then((r) => r.json()),
      fetch("/api/wallet/withdraw").then((r) => r.json()),
    ]);
    setWallet(w.wallet);
    setTxs(w.transactions);
    setWithdrawals(wd.withdrawals ?? []);
  }

  useEffect(() => {
    load();
  }, []);

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
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Erro" });
      return;
    }
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
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Erro" });
      return;
    }
    setMsg({
      type: "ok",
      text: `Saque de ${formatCoins(withdrawValue)} solicitado. Aguarde aprovação.`,
    });
    setDestination("");
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="card">
          <h2 className="text-xs uppercase tracking-wider text-muted">Saldo disponível</h2>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-4xl font-bold text-accent">
              {wallet ? formatCoins(wallet.balance) : "—"}
            </div>
            <div className="text-sm text-muted">coins</div>
          </div>
          {wallet && wallet.locked > 0 && (
            <div className="mt-2 text-sm text-muted">
              🔒 {formatCoins(wallet.locked)} coins em escrow (apostas ativas)
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 text-lg font-semibold">Histórico de transações</h3>
          {txs.length === 0 ? (
            <p className="text-sm text-muted">Sem transações ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {txs.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{txLabel(t.type)}</div>
                    <div className="text-xs text-muted">
                      {formatDate(t.createdAt)} {t.note ? `• ${t.note}` : ""}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${t.amount >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {formatCoins(t.amount)}
                  </div>
                </li>
              ))}
            </ul>
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
                    <div className="text-sm font-medium">
                      {formatCoins(w.amount)} coins — {w.method}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(w.createdAt)} • {w.destination}
                    </div>
                  </div>
                  <span
                    className={
                      w.status === "PAID"
                        ? "badge-success"
                        : w.status === "REJECTED"
                          ? "badge-danger"
                          : "badge"
                    }
                  >
                    {w.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-semibold">Depositar</h3>
          <p className="mt-1 text-xs text-muted">
            (Sandbox) — em produção, integração com gateway real.
          </p>
          <form onSubmit={deposit} className="mt-4 space-y-3">
            <div>
              <label className="label">Valor (coins)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={depositValue}
                onChange={(e) => setDepositValue(Math.max(1, Number(e.target.value)))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[100, 500, 1000, 5000].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setDepositValue(v)}
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-white"
                  >
                    {formatCoins(v)}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              Depositar
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold">Sacar</h3>
          <p className="mt-1 text-xs text-muted">
            Valor mínimo: 100 coins. Saque processado em até 24h.
          </p>
          <form onSubmit={withdraw} className="mt-4 space-y-3">
            <div>
              <label className="label">Valor (coins)</label>
              <input
                type="number"
                min={100}
                className="input"
                value={withdrawValue}
                onChange={(e) => setWithdrawValue(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="label">Método</label>
              <select
                className="input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="PIX">PIX</option>
                <option value="USDT">USDT (TRC20)</option>
                <option value="BTC">Bitcoin</option>
                <option value="BANK">Transferência bancária</option>
              </select>
            </div>
            <div>
              <label className="label">Destino (chave / endereço)</label>
              <input
                className="input"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="chave PIX, endereço carteira, etc"
                required
              />
            </div>
            <button type="submit" disabled={busy} className="btn-secondary w-full">
              Solicitar saque
            </button>
          </form>
        </div>

        {msg && (
          <div
            className={`card text-sm ${msg.type === "ok" ? "text-success" : "text-danger"}`}
          >
            {msg.text}
          </div>
        )}
      </aside>
    </div>
  );
}

function txLabel(t: string) {
  switch (t) {
    case "DEPOSIT":
      return "Depósito";
    case "WITHDRAWAL":
      return "Saque";
    case "WAGER_LOCK":
      return "Aposta em escrow";
    case "WAGER_REFUND":
      return "Reembolso de aposta";
    case "WAGER_WIN":
      return "Prêmio recebido";
    case "WAGER_LOSS":
      return "Aposta perdida";
    case "ADJUSTMENT":
      return "Ajuste";
    default:
      return t;
  }
}
