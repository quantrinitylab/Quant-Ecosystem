/** App context where a game can be hosted */
export type AppContext =
  | 'chat_embed'
  | 'feed_embed'
  | 'fullscreen'
  | 'meeting_icebreaker'
  | 'random_match';

/** Game session lifecycle state */
export type GameSessionState = 'waiting' | 'active' | 'paused' | 'finished' | 'abandoned';

/** Role of a participant in a game session */
export type PlayerRole = 'host' | 'player' | 'spectator';

/** How a player's identity is displayed */
export type IdentityMode = 'anonymous' | 'pseudonymous' | 'revealed' | 'friends_only';

/** Age classification for safety enforcement */
export type AgeGroup = 'under13' | 'teen' | 'adult';

/** Scope for leaderboard queries */
export type LeaderboardScope = 'global' | 'friends' | 'app_context' | 'regional';

/** A player in a game session */
export interface Player {
  userId: string;
  displayName: string;
  identityMode: IdentityMode;
  role: PlayerRole;
  score: number;
  joinedAt: Date;
  isMinor: boolean;
  ageGroup: AgeGroup;
}

/** Configuration for a game session */
export interface GameSessionConfig {
  maxPlayers: number;
  allowSpectators: boolean;
  turnBased: boolean;
  timeLimit?: number;
  customData?: Record<string, unknown>;
}

/** A game session instance */
export interface GameSession {
  id: string;
  gameId: string;
  appContext: AppContext;
  state: GameSessionState;
  host: string;
  players: Player[];
  spectators: Player[];
  maxPlayers: number;
  createdAt: Date;
  config: GameSessionConfig;
  stateData: Record<string, unknown>;
}

/** An event broadcast within a game session */
export interface GameEvent {
  type: string;
  payload: unknown;
  senderId: string;
  timestamp: Date;
}

/** A leaderboard entry */
export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  score: number;
  rank: number;
  appContext: AppContext;
  region?: string;
  submittedAt: Date;
}

/** An achievement unlocked by a player */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  gameId: string;
}

/** Record of an anti-cheat violation */
export interface AntiCheatViolation {
  playerId: string;
  gameId: string;
  reason: string;
  score: number;
  detectedAt: Date;
}

/** Configuration for minor safety enforcement */
export interface MinorSafetyConfig {
  blockRealMoney: boolean;
  restrictVoiceChat: boolean;
  restrictVideoChat: boolean;
  textFilteringEnabled: boolean;
  parentalVisibility: boolean;
  maxPlayTimeMinutes?: number;
}

/** Hosting constraints for a given app context */
export interface HostingConfig {
  appContext: AppContext;
  maxWidth: number;
  maxHeight: number;
  interactionModel: 'tap' | 'swipe' | 'full' | 'turn_based' | 'split_screen';
  audioEnabled: boolean;
  videoEnabled: boolean;
  overlayMode: boolean;
  autoplay: boolean;
}

/** Consent record for identity reveal */
export interface IdentityRevealConsent {
  fromUserId: string;
  toUserId: string;
  consentedAt: Date;
  revoked: boolean;
}

/** Communication limits for a given age group */
export interface CommunicationLimits {
  voiceChat: boolean;
  videoChat: boolean;
  textChat: boolean;
  textFiltering: boolean;
  canChatWithStrangers: boolean;
}

/** Gaming activity record for parental visibility */
export interface GamingActivity {
  gameId: string;
  sessionId: string;
  startedAt: Date;
  duration: number;
  appContext: AppContext;
}

/** Leaderboard query options */
export interface LeaderboardOptions {
  limit?: number;
  offset?: number;
  appContext?: AppContext;
  region?: string;
}

/** Configuration for GameSessionService */
export interface GameSessionServiceConfig {
  defaultMaxPlayers: number;
  defaultAllowSpectators: boolean;
}

/** Configuration for UniversalLeaderboardService */
export interface UniversalLeaderboardServiceConfig {
  maxScoreThreshold: number;
  minScoreThreshold: number;
}

/** Configuration for CrossAppHostService */
export interface CrossAppHostServiceConfig {
  defaultContext: AppContext;
}

/** Configuration for IdentityBridgeService */
export interface IdentityBridgeServiceConfig {
  defaultIdentityMode: IdentityMode;
}

/** Configuration for MinorSafetyService */
export interface MinorSafetyServiceConfig {
  safetyConfigs: Record<AgeGroup, MinorSafetyConfig>;
}

/** Context adapter for adapting games to a specific app context */
export interface ContextAdapter {
  appContext: AppContext;
  adapt(gameId: string): HostingConfig;
}

/** Content rating for age-based game access control */
export type GameContentRating = 'everyone' | 'teen' | 'mature';

/** Registry entry for a game's metadata used in access and context checks */
export interface GameRegistryEntry {
  gameId: string;
  contentRating: GameContentRating;
  supportedContexts: AppContext[];
}

/** Public anonymous identity returned to callers (no real user ID exposed) */
export interface PublicAnonymousIdentity {
  anonymousId: string;
  displayName: string;
  createdAt: Date;
}
