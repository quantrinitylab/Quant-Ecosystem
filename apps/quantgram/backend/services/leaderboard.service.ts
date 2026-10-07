// ============================================================================
// QuantNeon - Cross-app Game Leaderboard Service
// ============================================================================
//
// The durable, ecosystem-wide leaderboard now lives in the shared
// `@quant/cross-app-gaming` package (`GameLeaderboardService`) so every Quant
// app that hosts games writes to and ranks across the SAME `GameScore` table
// (see QuantChat's /games routes). This file re-exports it under the historical
// `LeaderboardService` name so QuantNeon's existing route + tests keep working
// while there is a single source of truth for the cross-app rank graph.

export {
  GameLeaderboardService as LeaderboardService,
  LeaderboardValidationError,
} from '@quant/cross-app-gaming';
export type {
  GameLeaderboardPrisma as LeaderboardPrisma,
  SubmitScoreInput,
  PersistentLeaderboardEntry as LeaderboardEntry,
} from '@quant/cross-app-gaming';
