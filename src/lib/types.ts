export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "WAGER_LOCK"
  | "WAGER_REFUND"
  | "WAGER_WIN"
  | "WAGER_LOSS"
  | "ADJUSTMENT"
  | "ACHIEVEMENT";

export type AchievementCategory = "partidas" | "xadrez" | "bot" | "rating" | "apostas";

export interface AchievementType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  reward_coins: number;
  sort_order: number;
}

export interface UserAchievement {
  achievement_id: string;
  earned_at: string;
  achievement: AchievementType;
}

export type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";

export type MatchResult =
  | "WHITE_WIN"
  | "BLACK_WIN"
  | "DRAW"
  | "WHITE_RESIGN"
  | "BLACK_RESIGN"
  | "WHITE_TIMEOUT"
  | "BLACK_TIMEOUT"
  | "ABORTED";

export type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface ChessUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ChessWallet {
  id: string;
  user_id: string;
  balance: number;
  locked: number;
  created_at: string;
  updated_at: string;
}

export interface ChessTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  match_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ChessMatch {
  id: string;
  wager: number;
  rating_min: number | null;
  rating_max: number | null;
  status: MatchStatus;
  result: MatchResult | null;
  white_user_id: string | null;
  black_user_id: string | null;
  creator_id: string;
  winner_id: string | null;
  fen: string;
  pgn: string;
  move_count: number;
  turn: string;
  pot: number;
  rake_bps: number;
  payout: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface ChessMatchWithPlayers extends ChessMatch {
  white_user: { id: string; username: string; rating: number } | null;
  black_user: { id: string; username: string; rating: number } | null;
  winner: { id: string; username: string } | null;
}

export interface ChessWithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  destination: string;
  status: WithdrawalStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}
