import type { BrowserSession, BrowserAction, ActionResult, EncryptedCookieData } from '../types.js';

export interface EncryptedCookieStore {
  save(sessionId: string, data: EncryptedCookieData): Promise<void>;
  load(sessionId: string): Promise<EncryptedCookieData | null>;
  clear(sessionId: string): Promise<void>;
}

const TIMEOUT_MS = 30 * 60 * 1000;
let sessionCounter = 0;

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();

  createSession(siteUrl: string, userId: string): BrowserSession {
    const id = `sess_${++sessionCounter}`;
    const now = Date.now();
    const session: BrowserSession = {
      id,
      userId,
      siteUrl,
      status: 'active',
      actions: [],
      startedAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(id, session);
    return session;
  }

  endSession(sessionId: string): void {
    const s = this.getSession(sessionId);
    s.status = 'closed';
  }

  getSession(sessionId: string): BrowserSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Session not found: ${sessionId}`);
    return s;
  }

  recordAction(sessionId: string, action: BrowserAction, result: ActionResult): void {
    const s = this.getSession(sessionId);
    s.actions.push({ action, result });
    s.lastActivityAt = Date.now();
  }

  checkTimeout(sessionId: string): boolean {
    const s = this.getSession(sessionId);
    return Date.now() - s.lastActivityAt > TIMEOUT_MS;
  }

  listActiveSessions(userId: string): BrowserSession[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId && s.status === 'active');
  }
}
