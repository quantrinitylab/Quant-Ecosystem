export * from './types.js';
export { ConnectFourEngine, ConnectFourError } from './services/connect-four-engine.service.js';
export type {
  ConnectFourErrorCode,
  Disc,
  Cell,
  ConnectFourMove,
  ConnectFourGameState,
  ConnectFourPublicState,
  CreateGameOptions as ConnectFourCreateGameOptions,
} from './services/connect-four-engine.service.js';
export {
  MonopolyEngine,
  MonopolyError,
  BOARD as MONOPOLY_BOARD,
  CHANCE_CARDS as MONOPOLY_CHANCE_CARDS,
  COMMUNITY_CHEST_CARDS as MONOPOLY_COMMUNITY_CHEST_CARDS,
  computeRent as computeMonopolyRent,
  isOwnable as isMonopolyOwnable,
} from './services/monopoly-engine.service.js';
export type {
  MonopolyErrorCode,
  PropertyColor,
  SpaceType,
  StreetSpace,
  RailroadSpace,
  UtilitySpace,
  TaxSpace,
  SimpleSpace,
  BoardSpace,
  OwnableSpace,
  MonopolyCard,
  MonopolyPlayer,
  PropertyState,
  TurnPhase,
  MonopolyAction,
  MonopolyGameState,
  MonopolyPublicState,
  RollDieFn,
  DrawCardFn,
  CreateGameOptions as MonopolyCreateGameOptions,
} from './services/monopoly-engine.service.js';
export { GameSessionService } from './services/game-session.service.js';
export { UniversalLeaderboardService } from './services/universal-leaderboard.service.js';
export {
  GameLeaderboardService,
  LeaderboardValidationError,
} from './services/game-leaderboard.service.js';
export type {
  GameScoreRow,
  GameLeaderboardPrisma,
  SubmitScoreInput,
  LeaderboardEntry as PersistentLeaderboardEntry,
} from './services/game-leaderboard.service.js';
export { BadgeAwardService, BadgeValidationError } from './services/badge-award.service.js';
export type {
  GameBadgeRow,
  GameBadgePrisma,
  AwardBadgeResult,
} from './services/badge-award.service.js';
export { LudoEngine, LudoError } from './services/ludo-engine.service.js';
export type {
  LudoErrorCode,
  LudoColor,
  LudoTokenLocation,
  LudoPlayer,
  LudoToken,
  LudoGameState,
  LudoLegalMove,
  LudoRollResult,
  LudoPublicToken,
  LudoPublicState,
  CreateGameOptions as LudoCreateGameOptions,
} from './services/ludo-engine.service.js';
export { CrossAppHostService } from './services/cross-app-host.service.js';
export { IdentityBridgeService } from './services/identity-bridge.service.js';
export { MinorSafetyService } from './services/minor-safety.service.js';
export {
  UnoEngine,
  UnoError,
  buildDeck,
  isPlayable,
  isWildValue,
  nextTurn,
} from './services/uno-engine.service.js';
export type {
  UnoErrorCode,
  UnoColor,
  UnoNumberValue,
  UnoActionValue,
  UnoWildValue,
  UnoValue,
  UnoCard,
  UnoPlayer,
  UnoAction,
  UnoGameState,
  UnoPublicState,
  ShuffleFn,
  CreateGameOptions as UnoCreateGameOptions,
} from './services/uno-engine.service.js';
