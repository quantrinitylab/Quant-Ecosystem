// ============================================================================
// Screen Time Monitor - Anti-engagement-trap and session time tracking
// ============================================================================

export type TimeAlertEvent = {
  userId: string;
  sessionMinutes: number;
  alertType: 'gentle_reminder' | 'extended_session';
};

export type EngagementTrapEvent = {
  userId: string;
  consecutiveRapidItems: number;
};

export interface EventEmitter {
  emit(event: string, data: unknown): void;
}

export interface ScreenTimeMonitorConfig {
  alertThresholdMinutes: number;
  engagementTrapThreshold: number;
  rapidEngagementMs: number;
}

interface SessionState {
  sessionStart: number;
  lastItemTime: number;
  consecutiveRapid: number;
  optedOut: boolean;
}

export class ScreenTimeMonitor {
  private emitter: EventEmitter;
  private config: ScreenTimeMonitorConfig;
  private sessions: Map<string, SessionState> = new Map();

  constructor(emitter: EventEmitter, config?: Partial<ScreenTimeMonitorConfig>) {
    this.emitter = emitter;
    this.config = {
      alertThresholdMinutes: config?.alertThresholdMinutes ?? 30,
      engagementTrapThreshold: config?.engagementTrapThreshold ?? 10,
      rapidEngagementMs: config?.rapidEngagementMs ?? 3000,
    };
  }

  startSession(userId: string): void {
    if (this.sessions.has(userId)) {
      return;
    }
    this.sessions.set(userId, {
      sessionStart: Date.now(),
      lastItemTime: 0,
      consecutiveRapid: 0,
      optedOut: false,
    });
  }

  recordItemView(userId: string, timestamp: number): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    if (session.lastItemTime > 0) {
      const timeSinceLastItem = timestamp - session.lastItemTime;
      if (timeSinceLastItem < this.config.rapidEngagementMs) {
        session.consecutiveRapid++;
        if (session.consecutiveRapid >= this.config.engagementTrapThreshold) {
          const event: EngagementTrapEvent = {
            userId,
            consecutiveRapidItems: session.consecutiveRapid,
          };
          this.emitter.emit('engagement_trap', event);
        }
      } else {
        session.consecutiveRapid = 0;
      }
    }

    session.lastItemTime = timestamp;
  }

  checkSessionDuration(userId: string): { shouldAlert: boolean; minutes: number } {
    const session = this.sessions.get(userId);
    if (!session) return { shouldAlert: false, minutes: 0 };

    const minutes = (Date.now() - session.sessionStart) / 60000;

    if (minutes >= this.config.alertThresholdMinutes && !session.optedOut) {
      const alertType =
        minutes >= this.config.alertThresholdMinutes * 2 ? 'extended_session' : 'gentle_reminder';
      const event: TimeAlertEvent = {
        userId,
        sessionMinutes: Math.floor(minutes),
        alertType,
      };
      this.emitter.emit('time_alert', event);
      return { shouldAlert: true, minutes };
    }

    return { shouldAlert: false, minutes };
  }

  setOptOut(userId: string, optOut: boolean): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.optedOut = optOut;
    }
  }

  isOptedOut(userId: string): boolean {
    const session = this.sessions.get(userId);
    return session?.optedOut ?? false;
  }

  getSessionDuration(userId: string): number {
    const session = this.sessions.get(userId);
    if (!session) return 0;
    return (Date.now() - session.sessionStart) / 60000;
  }

  endSession(userId: string): void {
    this.sessions.delete(userId);
  }
}
