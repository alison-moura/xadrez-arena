"use client";
import { useEffect, useState, useCallback } from "react";
import { SKIN_DEFS, RARITY_COLORS, RARITY_LABELS, type SkinRarity } from "@/lib/skins";
import { formatCoins } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SkinSource = "purchased" | "dropped" | "traded";

interface SkinPack {
  id: string;
  name: string;
  description: string;
  rarity: SkinRarity;
  price_coins: number;
}

interface UserSkinInstance {
  id: string;
  skin_pack_id: string;
  acquired_at: string;
  source: SkinSource;
  is_listed: boolean;
  skin_pack?: SkinPack;
}

interface InventoryData {
  inventory: UserSkinInstance[];
  equippedSkinId: string;
}

const SOURCE_LABELS: Record<SkinSource, string> = {
  purchased: "Comprado",
  dropped: "Drop",
  traded: "Troca",
};

const SOURCE_COLORS: Record<SkinSource, string> = {
  purchased: "#4a90d9",
  dropped: "#41c96d",
  traded: "#9b59b6",
};

function BoardSwatch({ skinId, small }: { skinId: string; small?: boolean }) {
  const def = SKIN_DEFS[skinId];
  if (!def) return null;
  const cols = small ? 4 : 6;
  const rows = small ? 2 : 3;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const isLight = (row + col) % 2 === 0;
    return isLight ? def.boardLight : def.boardDark;
  });
  return (
    <div
      className="rounded overflow-hidden shrink-0"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, width: small ? 48 : 64, height: small ? 24 : 32 }}
    >
      {cells.map((color, i) => (
        <div key={i} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export default function InventoryPage() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [listingPrice, setListingPrice] = useState("");

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/skins");
    if (!res.ok) { setError("Erro ao carregar inventário"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleEquip(skinId: string) {
    setActionLoading("equip-" + skinId);
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

  async function handleList(userSkinId: string) {
    const price = parseInt(listingPrice, 10);
    if (!price || price < 1) { setError("Preço inválido"); return; }
    setActionLoading("list-" + userSkinId);
    setError(null);
    const res = await fetch("/api/market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userSkinId, price }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Erro ao listar"); setActionLoading(null); return; }
    setListingId(null);
    setListingPrice("");
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

  const inventory = data?.inventory ?? [];
  const equippedSkinId = data?.equippedSkinId ?? "classic";

  // Group by skin_pack_id
  const grouped: Record<string, UserSkinInstance[]> = {};
  for (const item of inventory) {
    if (!grouped[item.skin_pack_id]) grouped[item.skin_pack_id] = [];
    grouped[item.skin_pack_id].push(item);
  }

  // Sort groups: equipped first, then by name
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === equippedSkinId) return -1;
    if (b === equippedSkinId) return 1;
    return (SKIN_DEFS[a]?.name ?? a).localeCompare(SKIN_DEFS[b]?.name ?? b);
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Meu Inventário</h1>
        <p className="mt-1 text-sm text-muted">
          {inventory.length === 0
            ? "Nenhuma skin ainda. Compre na loja ou obtenha por drops após partidas."
            : `${inventory.length} skin${inventory.length !== 1 ? "s" : ""} no inventário`}
        </p>
      </div>

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-muted hover:text-white">×</button>
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🎨</div>
          <h2 className="font-semibold text-lg">Inventário vazio</h2>
          <p className="text-sm text-muted mt-1">Visite a loja para adquirir skins.</p>
          <a href="/shop" className="btn-primary mt-4 inline-block">Ir para Loja</a>
        </div>
      ) : (
        <div className="space-y-4">
          {groupKeys.map((packId) => {
            const instances = grouped[packId];
            const def = SKIN_DEFS[packId];
            const pack = instances[0]?.skin_pack;
            const name = def?.name ?? pack?.name ?? packId;
            const rarity: SkinRarity = (def?.rarity ?? pack?.rarity ?? "common") as SkinRarity;
            const rarityColor = RARITY_COLORS[rarity];
            const rarityLabel = RARITY_LABELS[rarity];
            const isEquipped = equippedSkinId === packId;

            return (
              <div key={packId} className={`card ${isEquipped ? "ring-2 ring-accent/60 border-accent/40" : ""}`}>
                <div className="flex items-start gap-4">
                  <BoardSwatch skinId={packId} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold">{name}</h2>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ backgroundColor: rarityColor + "25", color: rarityColor }}
                      >
                        {rarityLabel}
                      </span>
                      {isEquipped && (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                          Equipado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {instances.length} unidade{instances.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {!isEquipped && (
                    <button
                      onClick={() => handleEquip(packId)}
                      disabled={actionLoading !== null}
                      className="btn-secondary shrink-0 text-sm"
                    >
                      {actionLoading === "equip-" + packId ? "..." : "Equipar"}
                    </button>
                  )}
                </div>

                {/* Individual instances */}
                <div className="mt-3 space-y-2">
                  {instances.map((inst) => (
                    <div
                      key={inst.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-surfaceAlt px-3 py-2"
                    >
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: SOURCE_COLORS[inst.source] + "20", color: SOURCE_COLORS[inst.source] }}
                        >
                          {SOURCE_LABELS[inst.source]}
                        </span>
                        <span>{new Date(inst.acquired_at).toLocaleDateString("pt-BR")}</span>
                        {inst.is_listed && (
                          <span className="text-accent">Listado no mercado</span>
                        )}
                      </div>
                      {!inst.is_listed && (
                        <div className="flex items-center gap-2">
                          {listingId === inst.id ? (
                            <>
                              <input
                                type="number"
                                value={listingPrice}
                                onChange={(e) => setListingPrice(e.target.value)}
                                placeholder="Preço"
                                className="input w-24 text-xs py-1"
                                min={1}
                              />
                              <button
                                onClick={() => handleList(inst.id)}
                                disabled={actionLoading !== null}
                                className="btn-primary text-xs py-1 px-2"
                              >
                                {actionLoading === "list-" + inst.id ? "..." : "Confirmar"}
                              </button>
                              <button
                                onClick={() => { setListingId(null); setListingPrice(""); }}
                                className="text-muted hover:text-white text-xs"
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setListingId(inst.id); setListingPrice(""); }}
                              className="text-xs text-muted hover:text-white border border-border rounded px-2 py-1 transition-colors hover:border-accent/40"
                            >
                              Listar no mercado
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
