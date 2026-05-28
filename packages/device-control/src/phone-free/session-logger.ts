import type { PhoneFreeSession } from './types.js';

export class PhoneFreeSessionLogger {
  private sessions: PhoneFreeSession[] = [];

  startSession(): PhoneFreeSession {
    const session: PhoneFreeSession = {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      endTime: null,
      endReason: null,
    };
    this.sessions.push(session);
    return session;
  }

  endSession(id: string, reason: string): PhoneFreeSession | null {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) return null;
    s.endTime = Date.now();
    s.endReason = reason;
    return s;
  }

  listSessions(): PhoneFreeSession[] {
    return [...this.sessions];
  }

  getStats(period: 'week' | 'month'): {
    totalTime: number;
    sessionCount: number;
    averageDuration: number;
  } {
    const now = Date.now();
    const cutoff =
      period === 'week' ? now - 7 * 24 * 60 * 60 * 1000 : now - 30 * 24 * 60 * 60 * 1000;
    const filtered = this.sessions.filter((s) => s.startTime >= cutoff);
    const completed = filtered.filter((s) => s.endTime !== null);
    const totalTime = completed.reduce((sum, s) => sum + (s.endTime! - s.startTime), 0);
    const sessionCount = completed.length;
    const averageDuration = completed.length > 0 ? totalTime / completed.length : 0;
    return { totalTime, sessionCount, averageDuration };
  }
}
