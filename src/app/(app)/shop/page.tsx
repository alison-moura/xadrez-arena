"use client";
import { useEffect, useState, useCallback } from "react";
import { SKIN_DEFS, RARITY_COLORS, RARITY_LABELS, type SkinRarity } from "@/lib/skins";
import { formatCoins } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SkinPack {
  id: string;
  name: string;
  description: string;
  rarity: SkinRarity;
  price_coins: number;
  drop_weight: number;
  sort_order: number;
}

interface UserSkinInstance {
  id: string;
  skin_pack_id: string;
  is_listed: boolean;
}

interface ShopData {
  packs: SkinPack[];
  inventory: UserSkinInstance[];
  equippedSkinId: string;
}

function BoardSwatch({ skinId }: { skinId: string }) {
  const def = SKIN_DEFS[skinId];
  if (!def) return null;
  const cells = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const isLight = (row + col) % 2 === 0;
    return isLight ? def.boardLight : def.boardDark;
  });
  return (
    <div className="grid grid-cols-4 rounded-lg overflow-hidden" style={{ aspectRatio: "2/1" }}>
      {cells.map((color, i) => (
        <div key={i} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export default function ShopPage() {
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/skins");
    if (!res.ok) { setError("Erro ao carregar loja"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleBuy(packId: string) {
    setActionLoading(packId + "-buy");
    setError(null);
    const res = await fetch(`/api/skins/${packId}/buy`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Erro ao comprar"); setActionLoading(null); return; }
    await fetchData();
    setActionLoading(null);
  }

  async function handleEquip(skinId: string) {
    setActionLoading(skinId + "-equip");
    setError(null);
    const res = await fetch("/api/skins/equip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skinId }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Erro ao equipar"); setActionLoading(null); return; }
    await fetchData();
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const ownedIds = new Set(
    (data?.inventory ?? []).filter((s) => !s.is_listed).map((s) => s.skin_pack_id)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Loja de Skins</h1>
        <p className="mt-1 text-sm text-muted">
          Personalize seu tabuleiro. Skins também podem ser dropadas após partidas.
        </p>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-muted hover:text-white">×</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(data?.packs ?? []).map((pack) => {
          const def = SKIN_DEFS[pack.id];
          const isOwned = ownedIds.has(pack.id);
          const isEquipped = data?.equippedSkinId === pack.id;
          const rarityColor = RARITY_COLORS[pack.rarity];
          const rarityLabel = RARITY_LABELS[pack.rarity];

          return (
            <div
              key={pack.id}
              className={`card flex flex-col gap-3 transition-all ${
                isEquipped ? "ring-2 ring-accent/60 border-accent/40" : ""
              }`}
            >
              {/* Board swatch */}
              {def ? (
                <BoardSwatch skinId={pack.id} />
              ) : (
                <div className="rounded-lg bg-surfaceAlt" style={{ aspectRatio: "2/1" }} />
              )}

              {/* Header */}
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{pack.name}</h3>
                  {isEquipped && (
                    <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                      Equipado
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted">{pack.description}</p>
              </div>

              {/* Rarity + price */}
              <div className="flex items-center justify-between">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ backgroundColor: rarityColor + "25", color: rarityColor }}
                >
                  {rarityLabel}
                </span>
                <span className="text-sm font-semibold text-accent">
                  {pack.price_coins > 0
                    ? `${formatCoins(pack.price_coins)} coins`
                    : pack.id === "classic"
                    ? "Grátis"
                    : "Apenas por Drop"}
                </span>
              </div>

              {/* Action */}
              <div className="mt-auto space-y-2">
                {isOwned || pack.id === "classic" ? (
                  isEquipped ? (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 py-2 text-center text-xs text-accent">
                      ✓ Equipado
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEquip(pack.id)}
                      disabled={actionLoading !== null}
                      className="btn-secondary w-full text-sm"
                    >
                      {actionLoading === pack.id + "-equip" ? "Equipando..." : "Equipar"}
                    </button>
                  )
                ) : pack.price_coins > 0 ? (
                  <button
                    onClick={() => handleBuy(pack.id)}
                    disabled={actionLoading !== null}
                    className="btn-primary w-full text-sm"
                  >
                    {actionLoading === pack.id + "-buy" ? "Comprando..." : "Comprar"}
                  </button>
                ) : (
                  <div className="rounded-lg border border-border py-2 text-center text-xs text-muted">
                    Obter por Drop
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-surfaceAlt px-4 py-3 text-xs text-muted">
        Após cada partida finalizada, há 20% de chance de receber um skin aleatório como drop.
        Raridades mais altas têm menor probabilidade de cair.
      </div>
    </div>
  );
}
