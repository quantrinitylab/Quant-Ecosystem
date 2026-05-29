import { Permission } from '../types.js';
import type { SDKContext } from '../types.js';
import { PermissionGate } from './permission-gate.js';

export interface UserProfile {
  userId: string;
  displayName: string;
}

export interface ScoreEntry {
  userId: string;
  score: number;
  timestamp: number;
}

export interface MultiplayerSession {
  sessionId: string;
  hostId: string;
  players: string[];
  createdAt: number;
}

export interface AIInferenceResult {
  response: string;
  model: string;
  tokensUsed: number;
}

export interface TipRecord {
  fromUserId: string;
  amount: number;
  timestamp: number;
}

export class QuantSDK {
  private readonly gate: PermissionGate;
  private readonly context: SDKContext;
  private readonly storage = new Map<string, string>();
  private readonly files = new Map<string, string>();
  private readonly scores: ScoreEntry[] = [];
  private readonly achievements = new Set<string>();
  private readonly sessions = new Map<string, MultiplayerSession>();
  private readonly tips: TipRecord[] = [];

  constructor(context: SDKContext) {
    this.context = context;
    this.gate = new PermissionGate(context.permissions);
  }

  // Identity module
  getUserId(): string {
    this.gate.enforce(Permission.Identity);
    return this.context.userId;
  }

  getProfile(): UserProfile {
    this.gate.enforce(Permission.Identity);
    return { userId: this.context.userId, displayName: `User_${this.context.userId}` };
  }

  // Scores module
  submitScore(score: number): ScoreEntry {
    this.gate.enforce(Permission.Storage);
    const entry: ScoreEntry = {
      userId: this.context.userId,
      score,
      timestamp: Date.now(),
    };
    this.scores.push(entry);
    return entry;
  }

  getLeaderboard(limit = 10): ScoreEntry[] {
    this.gate.enforce(Permission.Storage);
    return [...this.scores].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  unlockAchievement(achievementId: string): boolean {
    this.gate.enforce(Permission.Storage);
    if (this.achievements.has(achievementId)) return false;
    this.achievements.add(achievementId);
    return true;
  }

  // Multiplayer module
  createSession(): MultiplayerSession {
    this.gate.enforce(Permission.Network);
    const session: MultiplayerSession = {
      sessionId: `session_${Date.now()}`,
      hostId: this.context.userId,
      players: [this.context.userId],
      createdAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  joinSession(sessionId: string): MultiplayerSession {
    this.gate.enforce(Permission.Network);
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.players.push(this.context.userId);
    return session;
  }

  broadcastState(sessionId: string, _state: Record<string, unknown>): boolean {
    this.gate.enforce(Permission.Network);
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return true;
  }

  // AI module
  infer(prompt: string, model = 'default'): AIInferenceResult {
    this.gate.enforce(Permission.AI);
    return {
      response: `AI response to: ${prompt}`,
      model,
      tokensUsed: prompt.length,
    };
  }

  // Storage module
  storageGet(key: string): string | undefined {
    this.gate.enforce(Permission.Storage);
    return this.storage.get(key);
  }

  storageSet(key: string, value: string): void {
    this.gate.enforce(Permission.Storage);
    this.storage.set(key, value);
  }

  storageDelete(key: string): boolean {
    this.gate.enforce(Permission.Storage);
    return this.storage.delete(key);
  }

  putFile(path: string, content: string): void {
    this.gate.enforce(Permission.Storage);
    this.validatePath(path);
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    this.gate.enforce(Permission.Storage);
    this.validatePath(path);
    return this.files.get(path);
  }

  private validatePath(path: string): void {
    if (path.startsWith('/')) {
      throw new Error('Absolute paths are not allowed');
    }
    if (path.includes('..')) {
      throw new Error('Path traversal is not allowed');
    }
  }

  // Tips module
  requestTip(amount: number): TipRecord {
    this.gate.enforce(Permission.Payments);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Tip amount must be a positive, finite number');
    }
    const tip: TipRecord = {
      fromUserId: 'anonymous',
      amount,
      timestamp: Date.now(),
    };
    this.tips.push(tip);
    return tip;
  }

  getTipHistory(): TipRecord[] {
    this.gate.enforce(Permission.Payments);
    return [...this.tips];
  }
}
