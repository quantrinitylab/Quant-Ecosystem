// ============================================================================
// Time Well Spent - Session tracking, regret prediction, and notifications
// ============================================================================

export interface SessionData {
  userId: string;
  startTime: number;
  duration: number;
  engagements: number;
  rapidScrolls: number;
}

export interface DailySummary {
  totalMinutes: number;
  sessions: number;
  engagementsPerMinute: number;
  rapidScrollRate: number;
}

export interface RegretPrediction {
  regretScore: number;
  suggestion: string;
  shouldNotify: boolean;
}

export interface SessionStore {
  get(userId: string): SessionData[];
  set(userId: string, sessions: SessionData[]): void;
}

export class InMemorySessionStore implements SessionStore {
  private store: Map<string, SessionData[]> = new Map();

  get(userId: string): SessionData[] {
    return this.store.get(userId) ?? [];
  }

  set(userId: string, sessions: SessionData[]): void {
    this.store.set(userId, sessions);
  }
}

export class TimeWellSpent {
  private sessionStore: SessionStore;
  private optOuts: Set<string> = new Set();

  constructor(sessionStore?: SessionStore) {
    this.sessionStore = sessionStore ?? new InMemorySessionStore();
  }

  trackSession(userId: string, data: SessionData): void {
    const sessions = this.sessionStore.get(userId);
    sessions.push(data);
    this.sessionStore.set(userId, sessions);
  }

  getDailySummary(userId: string): DailySummary {
    const sessions = this.sessionStore.get(userId);

    if (sessions.length === 0) {
      return { totalMinutes: 0, sessions: 0, engagementsPerMinute: 0, rapidScrollRate: 0 };
    }

    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration / 60, 0);
    const totalEngagements = sessions.reduce((sum, s) => sum + s.engagements, 0);
    const totalRapidScrolls = sessions.reduce((sum, s) => sum + s.rapidScrolls, 0);
    const totalScrollAndEngagements = totalRapidScrolls + totalEngagements;

    return {
      totalMinutes,
      sessions: sessions.length,
      engagementsPerMinute: totalMinutes > 0 ? totalEngagements / totalMinutes : 0,
      rapidScrollRate:
        totalScrollAndEngagements > 0 ? totalRapidScrolls / totalScrollAndEngagements : 0,
    };
  }

  predictRegret(userId: string): RegretPrediction {
    const summary = this.getDailySummary(userId);
    const sessions = this.sessionStore.get(userId);

    if (sessions.length === 0) {
      return { regretScore: 0, suggestion: '', shouldNotify: false };
    }

    // High regret: session > 30min AND (rapid scrolls > 50% OR engagements per minute < 1)
    const isLongSession = summary.totalMinutes > 30;
    const isHighRapidScroll = summary.rapidScrollRate > 0.5;
    const isLowEngagement = summary.engagementsPerMinute < 1;

    let regretScore = 0;

    if (isLongSession) {
      regretScore += 0.3;
    }
    if (isHighRapidScroll) {
      regretScore += 0.4;
    }
    if (isLowEngagement) {
      regretScore += 0.3;
    }

    const shouldNotify =
      isLongSession && (isHighRapidScroll || isLowEngagement) && !this.optOuts.has(userId);
    const minutes = Math.round(summary.totalMinutes);
    const suggestion = shouldNotify
      ? `You've been scrolling for ${minutes} minutes. Take a break?`
      : '';

    return { regretScore, suggestion, shouldNotify };
  }

  setOptOut(userId: string, optedOut: boolean): void {
    if (optedOut) {
      this.optOuts.add(userId);
    } else {
      this.optOuts.delete(userId);
    }
  }

  isOptedOut(userId: string): boolean {
    return this.optOuts.has(userId);
  }
}
