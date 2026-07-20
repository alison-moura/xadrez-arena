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
    if (msg.includes("invalid_time_control")) return "Tempo inválido (30s a 2h)";
    if (msg.includes("invalid_time_increment")) return "Incremento inválido (0 a 60s)";
    if (msg.includes("no_clock")) return "Partida sem relógio";
    if (msg.includes("still_has_time")) return "Oponente ainda tem tempo";
    if (msg.includes("cannot_offer_draw_to_bot")) return "Não dá pra oferecer empate ao bot";
    if (msg.includes("already_offered")) return "Você já ofereceu empate";
    if (msg.includes("no_draw_offer")) return "Sem oferta de empate pendente";
    if (msg.includes("cannot_decline_own_offer")) return "Não pode recusar sua própria oferta";
    if (msg.includes("cannot_accept_own_offer")) return "Não pode aceitar sua própria oferta";
    if (msg.includes("match_not_finished")) return "Partida ainda não terminou";
    if (msg.includes("rematch_not_supported_vs_bot")) return "Rematch indisponível contra bot";
    if (msg.includes("no_opponent")) return "Sem oponente para rematch";
    if (msg.includes("opponent_no_balance")) return "Oponente sem saldo para o rematch";
    if (msg.includes("rate_limited")) return "Calma com o chat — espere um pouco";
    if (msg.includes("cannot_chat_now")) return "Chat indisponível agora";
    if (msg.includes("empty_message")) return "Mensagem vazia";
    if (msg.includes("user_banned")) return "Usuário banido";
    if (msg.includes("not_challenged_user")) return "Este desafio é endereçado a outro jogador";
    if (msg.includes("cannot_challenge_self")) return "Você não pode desafiar a si mesmo";
    if (msg.includes("challenged_not_found")) return "Jogador desafiado não encontrado";
    if (msg.includes("too_many_pending_challenges")) return "Você já tem desafios pendentes demais para este jogador";
    if (msg.includes("rating_too_low")) return "Seu rating é muito baixo para esta partida";
    if (msg.includes("rating_too_high")) return "Seu rating é muito alto para esta partida";
    if (msg.includes("forbidden")) return "Acesso negado";
    if (msg.includes("tournament_not_found")) return "Torneio não encontrado";
    if (msg.includes("tournament_not_open")) return "Torneio não está aceitando inscrições";
    if (msg.includes("tournament_ended")) return "Torneio já terminou";
    if (msg.includes("not_pending")) return "Saque não está pendente";
    if (msg.includes("not_approved")) return "Saque não está aprovado";
    if (msg.includes("not_found")) return "Não encontrado";
    return msg;
  }
  return String(err);
}
