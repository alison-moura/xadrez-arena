export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "WAGER_LOCK"
  | "WAGER_REFUND"
  | "WAGER_WIN"
  | "WAGER_LOSS"
  | "ADJUSTMENT"
  | "ACHIEVEMENT";

export type AchievementCategory = "partidas" | "xadrez" | "bot" | "rating" | "apostas" | "overwatch";

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
export type OverwatchCaseStatus = "OPEN" | "RESOLVED";
export type OverwatchVerdict   = "CLEAN" | "CHEATER";

export interface ChessUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  rating: number;
  games_played: number;
  suspicion_score: number;
  banned_at: string | null;
  ban_reason: string | null;
  is_bot: boolean;
  equipped_skin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChessReport {
  id: string;
  reporter_id: string;
  accused_id:  string;
  match_id:    string;
  reason:      string;
  details:     string | null;
  created_at:  string;
}

export interface ChessOverwatchCase {
  id:           string;
  accused_id:   string;
  match_id:     string;
  status:       OverwatchCaseStatus;
  verdict:      OverwatchVerdict | null;
  votes_needed: number;
  created_at:   string;
  resolved_at:  string | null;
}

export interface ChessOverwatchVote {
  id:         string;
  case_id:    string;
  voter_id:   string;
  vote:       OverwatchVerdict;
  created_at: string;
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
  bot_difficulty: string | null;
  white_avg_cpl: number | null;
  black_avg_cpl: number | null;
  white_accuracy: number | null;
  black_accuracy: number | null;
  analyzed_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface ChessMatchWithPlayers extends ChessMatch {
  white_user: { id: string; username: string; rating: number; games_played?: number } | null;
  black_user: { id: string; username: string; rating: number; games_played?: number } | null;
  winner: { id: string; username: string } | null;
}

export type SkinSource = "purchased" | "dropped" | "traded";

export interface SkinPack {
  id: string;
  name: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  price_coins: number;
  drop_weight: number;
  sort_order: number;
}

export interface UserSkin {
  id: string;
  user_id: string;
  skin_pack_id: string;
  acquired_at: string;
  source: SkinSource;
  is_listed: boolean;
  skin_pack?: SkinPack;
}

export interface SkinListing {
  id: string;
  user_skin_id: string;
  seller_id: string;
  skin_pack_id: string;
  price_coins: number;
  listed_at: string;
  status: "active" | "sold" | "cancelled";
  seller?: { id: string; username: string };
  skin_pack?: SkinPack;
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
