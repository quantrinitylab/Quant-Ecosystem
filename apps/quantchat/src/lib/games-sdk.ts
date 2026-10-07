// ============================================================================
// QuantChat - Games SDK Hook Interface (Task 14.7)
//
// Exposes a small SDK surface for embedding third-party mini-games as iframe
// web apps inside chat conversations, and for receiving lifecycle events from
// them via window.postMessage.
//
// NOTE: The monorepo ships a richer `@quant/cross-app-gaming` package, but it
// is not a declared dependency of the quantchat app. Per Task 14.7 we therefore
// define the SDK hook interface locally here. The type names mirror the
// cross-app-gaming package (AppContext, GameSession, GameEvent, etc.) so a
// future migration to that package is mechanical.
//
// Requirements: 17.1, 17.4 (games SDK hook interface)
// ============================================================================

/** App context where a game can be hosted (mirrors @quant/cross-app-gaming). */
export type GameAppContext =
  | 'chat_embed'
  | 'feed_embed'
  | 'fullscreen'
  | 'meeting_icebreaker'
  | 'random_match';

/** A mini-game available in the launcher. */
export interface GameDefinition {
  /** Stable game identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Short tagline / description. */
  description: string;
  /** Emoji or icon URL shown in the launcher list. */
  icon: string;
  /** Fully-qualified URL loaded into the iframe. */
  url: string;
  /** Minimum players required (informational). */
  minPlayers: number;
  /** Maximum players supported. */
  maxPlayers: number;
}

/** Per-player final score reported when a game session ends. */
export interface GameScore {
  userId: string;
  displayName: string;
  score: number;
}

/** Payload of a `game_over` event posted by the embedded game. */
export interface GameOverPayload {
  gameId: string;
  sessionId: string;
  scores: GameScore[];
}

/**
 * Messages the embedded game posts to the host window.
 * The host validates `source === 'quant-game'` before trusting any message.
 */
export type GameInboundMessage =
  | { source: 'quant-game'; type: 'ready'; gameId: string }
  | { source: 'quant-game'; type: 'game_over'; payload: GameOverPayload }
  | { source: 'quant-game'; type: 'error'; gameId: string; message: string };

/** Messages the host posts down into the embedded game. */
export type GameOutboundMessage =
  | {
      source: 'quant-host';
      type: 'init';
      sessionId: string;
      context: GameAppContext;
      participantIds: string[];
    }
  | { source: 'quant-host'; type: 'end' };

/** Default time (ms) a game has to load before timing out. Requirement 17.5. */
export const GAME_LOAD_TIMEOUT_MS = 10_000;

/** Type guard: is an unknown postMessage a trusted game message? */
export function isGameMessage(data: unknown): data is GameInboundMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.source !== 'quant-game') return false;
  return d.type === 'ready' || d.type === 'game_over' || d.type === 'error';
}

/**
 * Build the human-readable system-message text posted to chat when a game
 * ends. Requirement 17.3: "display the final scores in the chat as a system
 * message". Scores are ranked highest-first.
 */
export function formatGameScoreMessage(game: GameDefinition, scores: GameScore[]): string {
  if (scores.length === 0) {
    return `${game.name} ended.`;
  }
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const lines = ranked.map((s, i) => `${i + 1}. ${s.displayName}: ${s.score}`);
  const winner = ranked[0];
  return `🎮 ${game.name} finished! Winner: ${winner.displayName} (${winner.score})\n${lines.join('\n')}`;
}

/** XP awarded to each participant when a game session ends. Requirement 17.3. */
export const GAME_COMPLETION_XP = 20;

/**
 * XP divisor for the proportional game-XP rule: a participant earns 1 XP per
 * this many game points (design section 10e: `Math.floor(score / 10)`).
 * Requirement 17.3.
 */
export const GAME_XP_DIVISOR = 10;

/**
 * XP awarded to a single participant for a given game score, using the
 * proportional rule defined in the design (Requirement 17.3). Negative scores
 * are clamped to zero so XP is never negative.
 */
export function gameXpForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score / GAME_XP_DIVISOR);
}

/**
 * Compute the XP award for every participant when a game session ends. Returns
 * a `userId → xp` map where each participant's XP is proportional to their
 * score (Requirement 17.3, Property 37).
 */
export function awardGameXp(scores: GameScore[]): Record<string, number> {
  const awards: Record<string, number> = {};
  for (const s of scores) {
    awards[s.userId] = gameXpForScore(s.score);
  }
  return awards;
}

// ─── SDK Hook Interface ──────────────────────────────────────────────────────

/** Options accepted by {@link useGameSdk}. */
export interface UseGameSdkOptions {
  /** Conversation the game session belongs to. */
  conversationId: string;
  /** Participant user IDs invited to the session. */
  participantIds: string[];
  /** Load timeout in ms (defaults to {@link GAME_LOAD_TIMEOUT_MS}). */
  loadTimeoutMs?: number;
  /** Called once the embedded game posts `ready`. */
  onReady?: (gameId: string) => void;
  /** Called when the game posts `game_over`. */
  onGameOver?: (payload: GameOverPayload) => void;
  /** Called when the game posts an error or fails to load in time. */
  onError?: (message: string) => void;
}

/** Loading state of an embedded game. */
export type GameLoadState = 'idle' | 'loading' | 'ready' | 'timeout' | 'error';

/** The value returned by the {@link useGameSdk} hook. */
export interface GameSdk {
  /** Current load state. */
  loadState: GameLoadState;
  /** The active game, or null when nothing is launched. */
  activeGame: GameDefinition | null;
  /** The current session id, or null. */
  sessionId: string | null;
  /** Launch a game (begins the load-timeout countdown). */
  launch: (game: GameDefinition) => void;
  /** Close/cancel the active game. */
  close: () => void;
  /** Retry loading the active game after a timeout/error. Requirement 17.5. */
  retry: () => void;
  /** Ref handler to attach to the game iframe element. */
  registerIframe: (iframe: HTMLIFrameElement | null) => void;
  /** Handle a raw window message event (exposed for testing). */
  handleMessage: (event: MessageEvent) => void;
}
