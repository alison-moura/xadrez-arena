import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

const globalForSupabase = globalThis as unknown as { __sb?: SupabaseClient };

export const supabase: SupabaseClient =
  globalForSupabase.__sb ??
  createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // garante que cada request escape do fetch cache do Next.js
      fetch: (input, init) =>
        fetch(input, { ...(init as RequestInit), cache: "no-store" }),
    },
  });

if (process.env.NODE_ENV !== "production") globalForSupabase.__sb = supabase;

export type RpcError = { code?: string; message: string };

export function rpcError(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = String((err as { message: string }).message);
    if (msg.includes("duplicate_username_or_email")) return "Usuário ou email já cadastrado";
    if (msg.includes("insufficient_balance")) return "Saldo insuficiente";
    if (msg.includes("min_withdrawal_100")) return "Valor mínimo de saque: 100 coins";
    if (msg.includes("invalid_amount")) return "Valor inválido";
    if (msg.includes("invalid_wager")) return "Aposta inválida";
    if (msg.includes("invalid_color")) return "Cor inválida";
    if (msg.includes("match_not_found")) return "Partida não encontrada";
    if (msg.includes("match_not_waiting")) return "Partida não está aceitando jogadores";
    if (msg.includes("match_not_active")) return "Partida não está ativa";
    if (msg.includes("already_in_match")) return "Você já está nesta partida";
    if (msg.includes("not_a_player")) return "Você não está nesta partida";
    if (msg.includes("not_your_turn")) return "Não é sua vez";
    if (msg.includes("not_creator")) return "Apenas o criador pode cancelar";
    if (msg.includes("wallet_not_found")) return "Carteira não encontrada";
    return msg;
  }
  return String(err);
}
