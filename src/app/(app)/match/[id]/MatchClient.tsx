"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import Link from "next/link";
import { formatCoins } from "@/lib/utils";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type MatchData = {
  id: string;
  wager: number;
  pot: number;
  payout: number;
  rake_bps: number;
  status: "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  result: string | null;
  fen: string;
  pgn: string;
  move_count: number;
  turn: string;
  creator_id: string;
  white_user_id: string | null;
  black_user_id: string | null;
  white_user: { id: string; username: string; rating: number } | null;
  black_user: { id: string; username: string; rating: number } | null;
  winner: { id: string; username: string } | null;
};

export function MatchClient({
  initialMatch,
  viewerId,
}: {
  initialMatch: MatchData;
  viewerId: string;
}) {
  const [match, setMatch] = useState<MatchData>(initialMatch);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isViewerWhite = match.white_user_id === viewerId;
  const isViewerBlack = match.black_user_id === viewerId;
  const isPlayer = isViewerWhite || isViewerBlack;
  const myColor: "w" | "b" | null = isViewerWhite ? "w" : isViewerBlack ? "b" : null;
  const orientation: "white" | "black" = isViewerBlack ? "black" : "white";

  const chess = useMemo(() => {
    const c = new Chess();
    try {
      if (match.pgn) c.loadPgn(match.pgn);
      else c.load(match.fen);
    } catch {
      c.load(match.fen);
    }
    return c;
  }, [match.fen, match.pgn]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/matches/${match.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMatch((prev) => {
      if (data.match.move_count === prev.move_count && data.match.status === prev.status) {
        return prev;
      }
      return data.match;
    });
  }, [match.id]);

  useEffect(() => {
    if (match.status === "FINISHED" || match.status === "CANCELLED") return;
    pollRef.current = setInterval(refresh, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [match.status, refresh]);

  function onDrop(source: string, target: string): boolean {
    if (match.status !== "ACTIVE") return false;
    if (!myColor || match.turn !== myColor) return false;

    const test = new Chess(match.fen);
    if (match.pgn) {
      try {
        test.loadPgn(match.pgn);
      } catch {
        /* ignora */
      }
    }
    let local;
    try {
      local = test.move({ from: source, to: target, promotion: "q" });
    } catch {
      return false;
    }
    if (!local) return false;

    setBusy(true);
    setError(null);
    void (async () => {
      const res = await fetch(`/api/matches/${match.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: source, to: target, promotion: "q" }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(data.error ?? "Erro no lance");
        await refresh();
        return;
      }
      setMatch(data.match);
    })();
    return true;
  }

  async function resign() {
    if (!confirm("Tem certeza que deseja desistir?")) return;
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/resign`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Erro");
      return;
    }
    setMatch(data.match);
  }

  async function cancel() {
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/cancel`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Erro");
      return;
    }
    await refresh();
  }

  async function joinMatch() {
    setBusy(true);
    const res = await fetch(`/api/matches/${match.id}/join`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Erro");
      return;
    }
    await refresh();
  }

  const opponent =
    myColor === "w" ? match.black_user : myColor === "b" ? match.white_user : null;
  const me =
    myColor === "w" ? match.white_user : myColor === "b" ? match.black_user : null;

  const inCheck = chess.inCheck?.() ?? false;
  const isMyTurn = isPlayer && match.status === "ACTIVE" && match.turn === myColor;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Partida #{match.id.slice(-6)}</h1>
          <Link href="/lobby" className="text-sm text-muted hover:text-white">
            ← lobby
          </Link>
        </div>

        <div className="card">
          <PlayerBar
            user={opponent}
            color={myColor === "w" ? "b" : "w"}
            isTurn={match.status === "ACTIVE" && match.turn !== myColor && !!myColor}
            placeholder={
              match.status === "WAITING" ? "Aguardando oponente…" : "Sem oponente"
            }
          />

          <div className="mx-auto my-3 aspect-square max-w-[560px]">
            <Chessboard
              position={match.fen}
              boardOrientation={orientation}
              onPieceDrop={onDrop}
              arePiecesDraggable={isMyTurn && !busy}
              customBoardStyle={{
                borderRadius: "8px",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              }}
              customDarkSquareStyle={{ backgroundColor: "#3a3a55" }}
              customLightSquareStyle={{ backgroundColor: "#d8d8e5" }}
            />
          </div>

          <PlayerBar
            user={me}
            color={myColor === "w" ? "w" : myColor === "b" ? "b" : "w"}
            isTurn={isMyTurn}
            placeholder={isPlayer ? `@${me?.username}` : "Espectador"}
          />

          {error && (
            <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {inCheck && match.status === "ACTIVE" && (
            <div className="mt-3 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
              ⚠️ Xeque!
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Pote</span>
            <span className="badge-accent">{Math.round(match.rake_bps / 100)}% rake</span>
          </div>
          <div className="mt-1 text-3xl font-bold text-accent">
            {formatCoins(match.pot)} <span className="text-base text-muted">coins</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Aposta de cada jogador: {formatCoins(match.wager)}
          </div>
          {match.payout > 0 && (
            <div className="mt-2 text-sm">
              Prêmio pago:{" "}
              <span className="font-semibold text-success">
                {formatCoins(match.payout)} coins
              </span>{" "}
              → @{match.winner?.username}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Status
          </h3>
          <div className="mt-2 text-sm">
            {match.status === "WAITING" && (
              <p>
                Aguardando segundo jogador.{" "}
                {match.creator_id === viewerId
                  ? "Você é o anfitrião."
                  : "Você pode entrar abaixo."}
              </p>
            )}
            {match.status === "ACTIVE" && (
              <p>
                {isPlayer
                  ? isMyTurn
                    ? "Sua vez de jogar."
                    : "Vez do oponente."
                  : "Partida em andamento."}
              </p>
            )}
            {match.status === "FINISHED" && (
              <p>
                Partida finalizada — <strong>{resultLabel(match.result)}</strong>
              </p>
            )}
            {match.status === "CANCELLED" && <p>Partida cancelada.</p>}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {match.status === "WAITING" && !isPlayer && (
              <button onClick={joinMatch} disabled={busy} className="btn-primary">
                Entrar na partida ({formatCoins(match.wager)} coins)
              </button>
            )}
            {match.status === "WAITING" && match.creator_id === viewerId && (
              <button onClick={cancel} disabled={busy} className="btn-danger">
                Cancelar partida
              </button>
            )}
            {match.status === "ACTIVE" && isPlayer && (
              <button onClick={resign} disabled={busy} className="btn-danger">
                Desistir
              </button>
            )}
            {match.status === "FINISHED" && (
              <Link href="/lobby" className="btn-primary">
                Voltar pro lobby
              </Link>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Lances ({match.move_count})
          </h3>
          <div className="mt-2 max-h-60 overflow-y-auto text-sm">
            <PgnList pgn={match.pgn} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function PlayerBar({
  user,
  color,
  isTurn,
  placeholder,
}: {
  user: { username: string; rating: number } | null;
  color: "w" | "b";
  isTurn: boolean;
  placeholder: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-border bg-surfaceAlt px-3 py-2 ${
        isTurn ? "ring-1 ring-accent" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xl">{color === "w" ? "♔" : "♚"}</span>
        {user ? (
          <>
            <span className="font-medium">@{user.username}</span>
            <span className="text-xs text-muted">({user.rating})</span>
          </>
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
      </div>
      {isTurn && <span className="badge-accent">jogando</span>}
    </div>
  );
}

function PgnList({ pgn }: { pgn: string }) {
  if (!pgn) return <p className="text-xs text-muted">Sem lances ainda.</p>;
  const tokens = pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !/^(\[|1-0|0-1|1\/2-1\/2|\*$)/.test(t));
  const pairs: { num: number; w?: string; b?: string }[] = [];
  for (const t of tokens) {
    const m = t.match(/^(\d+)\.+$/);
    if (m) {
      pairs.push({ num: Number(m[1]) });
    } else if (pairs.length) {
      const last = pairs[pairs.length - 1];
      if (!last.w) last.w = t;
      else if (!last.b) last.b = t;
    }
  }
  return (
    <ol className="space-y-1 font-mono text-xs">
      {pairs.map((p) => (
        <li key={p.num} className="flex gap-2">
          <span className="w-6 text-muted">{p.num}.</span>
          <span className="w-16">{p.w}</span>
          <span className="w-16">{p.b}</span>
        </li>
      ))}
    </ol>
  );
}

function resultLabel(result: string | null): string {
  switch (result) {
    case "WHITE_WIN":
      return "Brancas venceram (xeque-mate)";
    case "BLACK_WIN":
      return "Pretas venceram (xeque-mate)";
    case "WHITE_RESIGN":
      return "Brancas desistiram";
    case "BLACK_RESIGN":
      return "Pretas desistiram";
    case "DRAW":
      return "Empate";
    case "WHITE_TIMEOUT":
      return "Brancas perderam por tempo";
    case "BLACK_TIMEOUT":
      return "Pretas perderam por tempo";
    default:
      return "Encerrada";
  }
}
