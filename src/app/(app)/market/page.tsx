"use client";
import { useCallback, useEffect, useState } from "react";
import { SKIN_DEFS, RARITY_COLORS, RARITY_LABELS, type SkinRarity } from "@/lib/skins";
import { formatCoins } from "@/lib/utils";
import type { SkinListing } from "@/lib/types";

export const dynamic = "force-dynamic";

function BoardSwatch({ skinId }: { skinId: string }) {
  const def = SKIN_DEFS[skinId];
  if (!def) return null;
  return (
    <div className="shrink-0 overflow-hidden rounded" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", width: 48, height: 24 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          style={{ backgroundColor: (Math.floor(i / 4) + (i % 4)) % 2 === 0 ? def.boardLight : def.boardDark }}
        />
      ))}
    </div>
  );
}

export default function MarketPage() {
  const [listings, setListings] = useState<SkinListing[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/market");
    if (res.ok) {
      const d = await res.json();
      setListings(d.listings ?? []);
    }
    setLoading(false);
  }, []);

  // Get viewer id via session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (d?.user?.id) setViewerId(d.user.id); })
      .catch(() => {});
    void load();
  }, [load]);

  async function buy(listingId: string) {
    setBusy(listingId);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/market/${listingId}/buy`, { method: "POST" });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) { setError(d.error ?? "Erro ao comprar"); return; }
    setSuccess("Skin comprada com sucesso! Veja seu inventário.");
    void load();
  }

  async function cancel(listingId: string) {
    setBusy(listingId);
    setError(null);
    const res = await fetch(`/api/market/${listingId}/cancel`, { method: "POST" });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) { setError(d.error ?? "Erro ao cancelar"); return; }
    void load();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Mercado de Skins</h1>
        <p className="mt-1 text-sm text-muted">
          Compre e venda skins com outros jogadores. Taxa de 10% sobre cada venda.
        </p>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-muted hover:text-white">×</button>
        </div>
      )}
      {success && (
        <div className="rounded border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-3 text-muted hover:text-white">×</button>
        </div>
      )}

      {listings.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="mb-3 text-4xl">🏪</div>
          <h2 className="text-lg font-semibold">Mercado vazio</h2>
          <p className="mt-1 text-sm text-muted">
            Nenhuma skin à venda no momento. Liste as suas no{" "}
            <a href="/inventory" className="text-accent underline-offset-2 hover:underline">
              Inventário
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const def = SKIN_DEFS[listing.skin_pack_id];
            const pack = listing.skin_pack;
            const name = def?.name ?? pack?.name ?? listing.skin_pack_id;
            const rarity = (def?.rarity ?? pack?.rarity ?? "common") as SkinRarity;
            const rarityColor = RARITY_COLORS[rarity];
            const isMine = viewerId && listing.seller_id === viewerId;

            return (
              <div
                key={listing.id}
                className="card flex items-center gap-4"
              >
                <BoardSwatch skinId={listing.skin_pack_id} />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ backgroundColor: rarityColor + "25", color: rarityColor }}
                    >
                      {RARITY_LABELS[rarity]}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Vendedor:{" "}
                    <span className="text-white">@{listing.seller?.username ?? "—"}</span>
                    {" · "}
                    {new Date(listing.listed_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-lg font-bold text-accent">
                    {formatCoins(listing.price_coins)}
                    <span className="ml-1 text-xs font-normal text-muted">coins</span>
                  </span>

                  {isMine ? (
                    <button
                      onClick={() => cancel(listing.id)}
                      disabled={busy === listing.id}
                      className="btn-danger text-sm"
                    >
                      {busy === listing.id ? "..." : "Cancelar"}
                    </button>
                  ) : (
                    <button
                      onClick={() => buy(listing.id)}
                      disabled={busy !== null}
                      className="btn-primary text-sm"
                    >
                      {busy === listing.id ? "Comprando..." : "Comprar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surfaceAlt px-4 py-3 text-xs text-muted">
        <strong className="text-white">Como vender:</strong> Vá ao{" "}
        <a href="/inventory" className="text-accent underline-offset-2 hover:underline">
          Inventário
        </a>
        , clique em "Listar no mercado" em qualquer skin e defina um preço.
        O vendedor recebe 90% do valor (10% de taxa da plataforma).
      </div>
    </div>
  );
}
