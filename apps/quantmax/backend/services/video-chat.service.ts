// ============================================================================
// QuantMax - Video Chat Service (Omegle-style random pairing)
// ============================================================================
//
// Backs the (previously dead) /videochat/{join,skip,end} surface. Interest-based
// matchmaking with a single in-memory waiting queue + active-session map, so it
// MUST be a singleton (decorated once at boot — the old per-request
// RandomChatService re-created its queue on every call, so it never matched).
// Matched sessions are persisted (VideoChatSession) for history/abuse handling.
//
// Media is peer-to-peer (WebRTC, client-side); this service owns pairing +
// session lifecycle, not the media stream. DI'd narrow prisma + clock + id-gen
// for testability.

import { randomUUID } from 'node:crypto';
import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

export interface VideoChatPreferences {
  interests?: string[];
  ageRange?: { min: number; max: number };
  genders?: string[];
  language?: string;
  enableTextFallback?: boolean;
  enableGames?: boolean;
}

export interface VideoChatSessionView {
  id: string;
  participants: [string, string];
  status: 'connected' | 'ended' | 'skipped';
  matchedInterests: string[];
  hasTextFallback: boolean;
  startedAt: string;
}

export type JoinResult =
  | { status: 'waiting' }
  | {
      status: 'matched';
      session: VideoChatSessionView;
      /** LiveKit room for this pairing (deterministic from session id). */
      roomName: string;
      /**
       * The CALLER's own LiveKit access token — never the partner's. Undefined
       * when LiveKit is not configured (media cannot start; matchmaking still
       * works). Each participant only ever receives their own token, so no
       * participant can impersonate the other.
       */
      selfToken?: string;
    };

/**
 * Issues a LiveKit access token for a single identity. Injectable so the
 * service is unit-testable without LiveKit credentials.
 */
export interface VideoChatTokenIssuer {
  issue(roomName: string, identity: string): Promise<string>;
}

/**
 * Build a real LiveKit token issuer from env (LIVEKIT_API_KEY / LIVEKIT_API_SECRET).
 * Returns undefined when unconfigured — the caller then issues NO token
 * (fail-closed: media cannot start, never a fake/insecure token). Tokens are
 * scoped to the caller's own identity with a short TTL (ephemeral random chat).
 */
export function createLiveKitTokenIssuer(): VideoChatTokenIssuer | undefined {
  const apiKey = process.env['LIVEKIT_API_KEY'];
  const apiSecret = process.env['LIVEKIT_API_SECRET'];
  if (!apiKey || !apiSecret) return undefined;
  return {
    issue: async (roomName: string, identity: string) => {
      const grant: VideoGrant = {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      };
      const token = new AccessToken(apiKey, apiSecret, { identity, name: identity, ttl: '30m' });
      token.addGrant(grant);
      return token.toJwt();
    },
  };
}

export interface VideoChatPrisma {
  videoChatSession: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}

interface WaitingEntry {
  userId: string;
  prefs: VideoChatPreferences;
}

interface ActiveSession {
  id: string;
  participants: [string, string];
  prefs: Record<string, VideoChatPreferences>;
  matchedInterests: string[];
  hasTextFallback: boolean;
  startedAt: number;
}

export class VideoChatService {
  private waiting: WaitingEntry[] = [];
  private sessions = new Map<string, ActiveSession>();
  private userToSession = new Map<string, string>();

  constructor(
    private readonly prisma: VideoChatPrisma,
    private readonly now: () => number = () => Date.now(),
    private readonly genId: () => string = () => randomUUID(),
    private readonly tokenIssuer: VideoChatTokenIssuer | undefined = createLiveKitTokenIssuer(),
  ) {}

  /** Deterministic LiveKit room name for a session. */
  private roomNameFor(sessionId: string): string {
    return `max-random:${sessionId}`;
  }

  /**
   * Build the matched result for a SPECIFIC caller. Issues only the caller's
   * own LiveKit token (never the partner's), so the response cannot be used to
   * impersonate the other participant.
   */
  private async toMatched(session: ActiveSession, forUserId: string): Promise<JoinResult> {
    const roomName = this.roomNameFor(session.id);
    const selfToken = this.tokenIssuer
      ? await this.tokenIssuer.issue(roomName, forUserId)
      : undefined;
    return {
      status: 'matched',
      session: this.toView(session),
      roomName,
      ...(selfToken ? { selfToken } : {}),
    };
  }

  /** Normalize interests to a lowercased, de-duped, non-empty set. */
  private normInterests(interests?: string[]): string[] {
    if (!interests) return [];
    return Array.from(
      new Set(interests.map((i) => i.trim().toLowerCase()).filter((i) => i.length > 0)),
    );
  }

  /** Two users are compatible if their interests overlap, or if either has none. */
  private matchInterests(a: VideoChatPreferences, b: VideoChatPreferences): string[] | null {
    const ai = this.normInterests(a.interests);
    const bi = this.normInterests(b.interests);
    if (ai.length === 0 || bi.length === 0) return ['general'];
    const overlap = ai.filter((i) => bi.includes(i));
    return overlap.length > 0 ? overlap : null;
  }

  async join(userId: string, prefs: VideoChatPreferences): Promise<JoinResult> {
    // Already in a session — return it (idempotent).
    const existingId = this.userToSession.get(userId);
    if (existingId) {
      const s = this.sessions.get(existingId);
      if (s) return this.toMatched(s, userId);
    }

    // Re-joining while queued: drop the stale queue entry first.
    this.waiting = this.waiting.filter((w) => w.userId !== userId);

    // Find the first compatible waiting partner.
    for (let i = 0; i < this.waiting.length; i += 1) {
      const candidate = this.waiting[i]!;
      const matched = this.matchInterests(prefs, candidate.prefs);
      if (matched) {
        this.waiting.splice(i, 1);
        const session = await this.createSession(
          candidate.userId,
          candidate.prefs,
          userId,
          prefs,
          matched,
        );
        return this.toMatched(session, userId);
      }
    }

    // No match — enqueue and wait.
    this.waiting.push({ userId, prefs });
    return { status: 'waiting' };
  }

  /** Leave the current session (record it) and re-enter matchmaking. */
  async skip(userId: string): Promise<JoinResult> {
    const prefs = await this.leave(userId, 'SKIPPED');
    return this.join(userId, prefs ?? {});
  }

  /** Leave the current session/queue entirely. */
  async end(userId: string): Promise<{ ended: boolean }> {
    const had = await this.leave(userId, 'ENDED');
    this.waiting = this.waiting.filter((w) => w.userId !== userId);
    return { ended: had !== null };
  }

  getActiveSession(userId: string): VideoChatSessionView | null {
    const id = this.userToSession.get(userId);
    if (!id) return null;
    const s = this.sessions.get(id);
    return s ? this.toView(s) : null;
  }

  private async createSession(
    userA: string,
    prefsA: VideoChatPreferences,
    userB: string,
    prefsB: VideoChatPreferences,
    matchedInterests: string[],
  ): Promise<ActiveSession> {
    const id = this.genId();
    const hasTextFallback = Boolean(prefsA.enableTextFallback || prefsB.enableTextFallback);
    const session: ActiveSession = {
      id,
      participants: [userA, userB],
      prefs: { [userA]: prefsA, [userB]: prefsB },
      matchedInterests,
      hasTextFallback,
      startedAt: this.now(),
    };
    this.sessions.set(id, session);
    this.userToSession.set(userA, id);
    this.userToSession.set(userB, id);

    await this.prisma.videoChatSession.create({
      data: {
        id,
        user1Id: userA,
        user2Id: userB,
        status: 'CONNECTED',
        matchedInterests,
        hasTextFallback,
        startedAt: new Date(session.startedAt),
      },
    });
    return session;
  }

  /** Tear down the caller's active session; returns the caller's prefs (for skip). */
  private async leave(
    userId: string,
    status: 'ENDED' | 'SKIPPED',
  ): Promise<VideoChatPreferences | null> {
    const id = this.userToSession.get(userId);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) {
      this.userToSession.delete(userId);
      return null;
    }

    const prefs = session.prefs[userId] ?? {};
    const durationSec = Math.max(0, Math.round((this.now() - session.startedAt) / 1000));

    this.sessions.delete(id);
    for (const p of session.participants) this.userToSession.delete(p);

    await this.prisma.videoChatSession.update({
      where: { id },
      data: { status, endedAt: new Date(this.now()), durationSec },
    });
    return prefs;
  }

  private toView(s: ActiveSession): VideoChatSessionView {
    return {
      id: s.id,
      participants: s.participants,
      status: 'connected',
      matchedInterests: s.matchedInterests,
      hasTextFallback: s.hasTextFallback,
      startedAt: new Date(s.startedAt).toISOString(),
    };
  }
}

export function createVideoChatService(prisma: VideoChatPrisma): VideoChatService {
  return new VideoChatService(prisma);
}
