// ============================================================================
// Moderation - Live Moderator
// Real-time stream moderation with frame sampling and keyword detection
// ============================================================================

import { EventEmitter } from 'events';
import type {
  LiveModerationEvent,
  LiveModerationSession,
  StreamModerationConfig,
  ModerationResult,
} from '../types';
import type { ImageClassifier } from './image-classifier';

const DEFAULT_PROFANITY_KEYWORDS = [
  'fuck',
  'shit',
  'damn',
  'bitch',
  'ass',
  'bastard',
  'crap',
  'dick',
  'piss',
  'slut',
];

const DEFAULT_CONFIG: StreamModerationConfig = {
  frameSampleIntervalMs: 2000,
  violationThresholdForDisconnect: 3,
  violationThresholdForBan: 5,
  banDurationMs: 30 * 60 * 1000, // 30 minutes
  profanityKeywords: DEFAULT_PROFANITY_KEYWORDS,
};

export interface LiveModeratorDeps {
  imageClassifier: ImageClassifier;
  config?: Partial<StreamModerationConfig>;
}

/**
 * LiveModerator - Real-time stream moderation engine.
 *
 * Samples frames every 2s from a live stream source (pushed by caller).
 * Runs keyword detection on audio transcript text. Emits events:
 * - 'flag': warning for a detected violation
 * - 'disconnect': auto-terminate the stream after threshold violations
 * - 'ban': temporary ban applied after disconnect
 *
 * Tracks per-session violation count for escalation.
 */
export class LiveModerator extends EventEmitter {
  private readonly config: StreamModerationConfig;
  private readonly imageClassifier: ImageClassifier;
  private readonly sessions: Map<string, LiveModerationSession>;

  constructor(deps: LiveModeratorDeps) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
    this.imageClassifier = deps.imageClassifier;
    this.sessions = new Map();
  }

  /** Start a new live moderation session */
  startSession(sessionId: string, userId: string): LiveModerationSession {
    const session: LiveModerationSession = {
      sessionId,
      userId,
      startedAt: Date.now(),
      violationCount: 0,
      disconnected: false,
      banned: false,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /** Get current session state */
  getSession(sessionId: string): LiveModerationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Submit a frame buffer for classification */
  async submitFrame(sessionId: string, frameBuffer: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.banned) return;

    const result = await this.imageClassifier.classify(
      { base64: frameBuffer.toString('base64') },
      `live_${sessionId}_${Date.now()}`,
    );

    if (this.isViolation(result)) {
      this.recordViolation(session, `Frame violation: ${result.flags.join(', ')}`);
    }
  }

  /** Submit transcript text for keyword detection */
  submitTranscript(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.banned) return;

    const detected = this.detectProfanity(text);
    if (detected.length > 0) {
      this.recordViolation(session, `Profanity detected: ${detected.join(', ')}`);
    }
  }

  /** End a session gracefully */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Check if a user is currently banned */
  isSessionBanned(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.banned ?? false;
  }

  // --- Private Methods ---

  private isViolation(result: ModerationResult): boolean {
    return result.overallScore >= 0.6 || result.flags.length > 0;
  }

  private detectProfanity(text: string): string[] {
    const lower = text.toLowerCase();
    return this.config.profanityKeywords.filter((keyword) => lower.includes(keyword));
  }

  private recordViolation(session: LiveModerationSession, reason: string): void {
    session.violationCount++;
    session.lastFlagAt = Date.now();

    // Always emit a flag event
    const flagEvent: LiveModerationEvent = {
      type: 'flag',
      sessionId: session.sessionId,
      userId: session.userId,
      reason,
      timestamp: Date.now(),
      violationCount: session.violationCount,
    };
    this.emit('flag', flagEvent);

    // Check disconnect threshold
    if (
      session.violationCount >= this.config.violationThresholdForDisconnect &&
      !session.disconnected
    ) {
      session.disconnected = true;
      const disconnectEvent: LiveModerationEvent = {
        type: 'disconnect',
        sessionId: session.sessionId,
        userId: session.userId,
        reason: `Violation threshold reached (${session.violationCount} violations)`,
        timestamp: Date.now(),
        violationCount: session.violationCount,
      };
      this.emit('disconnect', disconnectEvent);
    }

    // Check ban threshold
    if (session.violationCount >= this.config.violationThresholdForBan && !session.banned) {
      session.banned = true;
      const banEvent: LiveModerationEvent = {
        type: 'ban',
        sessionId: session.sessionId,
        userId: session.userId,
        reason: `Temporary ban applied for ${this.config.banDurationMs / 60000} minutes`,
        timestamp: Date.now(),
        violationCount: session.violationCount,
      };
      this.emit('ban', banEvent);
    }
  }
}
