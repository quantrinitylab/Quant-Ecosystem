// ============================================================================
// Data Pipeline Package - Behavior Aggregator
// ============================================================================

import type {
  UserSession,
  SessionEvent,
  FunnelDefinition,
  FunnelStep,
  FunnelResult,
  FunnelStepResult,
  PathNode,
  PathTransition,
} from '../types';

/** User journey across sessions */
interface UserJourney {
  userId: string;
  sessions: UserSession[];
  totalEvents: number;
  firstSeen: number;
  lastSeen: number;
  totalDuration: number;
  averageSessionDuration: number;
  pagesVisited: Set<string>;
}

/** Raw event before session reconstruction */
interface RawEvent {
  userId: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  page: string;
  deviceType?: string;
  referrer?: string;
  elementId?: string;
}

/**
 * BehaviorAggregator - User behavior analysis engine
 * Provides session reconstruction, funnel analysis,
 * path analysis, and user journey tracking.
 */
export class BehaviorAggregator {
  private events: Map<string, RawEvent[]> = new Map();
  private sessions: Map<string, UserSession[]> = new Map();
  private funnels: Map<string, FunnelDefinition> = new Map();
  private sessionGap: number = 30 * 60 * 1000; // 30 minutes default
  private sessionCounter: number = 0;

  constructor(sessionGapMs: number = 30 * 60 * 1000) {
    this.sessionGap = sessionGapMs;
  }

  /**
   * Track a user event
   */
  public trackEvent(
    userId: string,
    type: string,
    name: string,
    page: string,
    properties: Record<string, unknown> = {},
    timestamp: number = Date.now(),
    options?: { deviceType?: string; referrer?: string; elementId?: string }
  ): void {
    const event: RawEvent = {
      userId,
      type,
      name,
      properties,
      timestamp,
      page,
      deviceType: options?.deviceType,
      referrer: options?.referrer,
      elementId: options?.elementId,
    };

    if (!this.events.has(userId)) {
      this.events.set(userId, []);
    }
    this.events.get(userId)!.push(event);

    // Keep events sorted by timestamp
    this.events.get(userId)!.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Reconstruct sessions from raw events for a user
   */
  public reconstructSession(userId: string): UserSession[] {
    const userEvents = this.events.get(userId);
    if (!userEvents || userEvents.length === 0) return [];

    const sessions: UserSession[] = [];
    let currentSession: SessionEvent[] = [];
    let sessionStart = userEvents[0].timestamp;
    let lastEventTime = userEvents[0].timestamp;
    let deviceType = userEvents[0].deviceType ?? 'unknown';
    let referrer = userEvents[0].referrer ?? 'direct';
    let landingPage = userEvents[0].page;

    for (const event of userEvents) {
      if (event.timestamp - lastEventTime > this.sessionGap) {
        // Gap exceeded, close current session
        if (currentSession.length > 0) {
          sessions.push(this.buildSession(
            userId, currentSession, sessionStart, lastEventTime, deviceType, referrer, landingPage
          ));
        }

        // Start new session
        currentSession = [];
        sessionStart = event.timestamp;
        deviceType = event.deviceType ?? 'unknown';
        referrer = event.referrer ?? 'direct';
        landingPage = event.page;
      }

      currentSession.push({
        id: `event-${currentSession.length}-${event.timestamp}`,
        type: event.type,
        name: event.name,
        properties: event.properties,
        timestamp: event.timestamp,
        page: event.page,
        elementId: event.elementId,
      });

      lastEventTime = event.timestamp;
    }

    // Close the last session
    if (currentSession.length > 0) {
      sessions.push(this.buildSession(
        userId, currentSession, sessionStart, lastEventTime, deviceType, referrer, landingPage
      ));
    }

    this.sessions.set(userId, sessions);
    return sessions;
  }

  /**
   * Analyze a funnel for conversion rates
   */
  public analyzeFunnel(definition: FunnelDefinition, userIds?: string[]): FunnelResult {
    // Register funnel
    this.funnels.set(definition.name, definition);

    const targetUsers = userIds ?? Array.from(this.events.keys());
    const stepCompletions: Map<number, Set<string>> = new Map();
    const stepTimes: Map<number, number[]> = new Map();

    // Initialize step tracking
    for (let i = 0; i < definition.steps.length; i++) {
      stepCompletions.set(i, new Set());
      stepTimes.set(i, []);
    }

    // Analyze each user
    for (const userId of targetUsers) {
      const userEvents = this.events.get(userId);
      if (!userEvents) continue;

      let currentStep = 0;
      let stepStartTime = 0;
      let funnelStartTime = 0;

      for (const event of userEvents) {
        if (currentStep >= definition.steps.length) break;

        const step = definition.steps[currentStep];
        if (this.matchesFunnelStep(event, step)) {
          stepCompletions.get(currentStep)!.add(userId);

          if (currentStep === 0) {
            funnelStartTime = event.timestamp;
            stepStartTime = event.timestamp;
          } else {
            const timeInStep = event.timestamp - stepStartTime;
            stepTimes.get(currentStep)!.push(timeInStep);

            // Check time window constraint
            if (definition.timeWindow > 0) {
              const elapsed = event.timestamp - funnelStartTime;
              if (elapsed > definition.timeWindow) break;
            }
          }

          stepStartTime = event.timestamp;
          currentStep++;
        }
      }
    }

    // Build funnel results
    const totalUsers = targetUsers.length;
    const steps: FunnelStepResult[] = definition.steps.map((step, idx) => {
      const usersCompleted = stepCompletions.get(idx)!.size;
      const usersEntered = idx === 0 ? totalUsers : stepCompletions.get(idx - 1)!.size;
      const times = stepTimes.get(idx) ?? [];
      const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

      return {
        stepName: step.name,
        usersEntered,
        usersCompleted,
        conversionRate: usersEntered > 0 ? usersCompleted / usersEntered : 0,
        dropOffRate: usersEntered > 0 ? 1 - (usersCompleted / usersEntered) : 0,
        averageTimeInStep: avgTime,
      };
    });

    const lastStepCompleted = stepCompletions.get(definition.steps.length - 1)?.size ?? 0;
    const overallConversion = totalUsers > 0 ? lastStepCompleted / totalUsers : 0;

    const allTimes = Array.from(stepTimes.values()).flat();
    const avgTimeToComplete = allTimes.length > 0
      ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length
      : 0;

    return {
      funnelName: definition.name,
      totalUsers,
      steps,
      overallConversionRate: overallConversion,
      averageTimeToComplete: avgTimeToComplete,
    };
  }

  /**
   * Perform path analysis across all users
   */
  public getPathAnalysis(maxDepth: number = 10): PathNode[] {
    const pageVisits: Map<string, number> = new Map();
    const transitions: Map<string, Map<string, number>> = new Map();
    const reverseTransitions: Map<string, Map<string, number>> = new Map();
    const exitCounts: Map<string, number> = new Map();
    const pageDurations: Map<string, number[]> = new Map();

    // Analyze all sessions
    for (const userSessions of this.sessions.values()) {
      for (const session of userSessions) {
        for (let i = 0; i < Math.min(session.events.length, maxDepth); i++) {
          const event = session.events[i];
          const page = event.page;

          // Count visits
          pageVisits.set(page, (pageVisits.get(page) ?? 0) + 1);

          // Track transitions
          if (i < session.events.length - 1) {
            const nextPage = session.events[i + 1].page;
            if (!transitions.has(page)) transitions.set(page, new Map());
            const trans = transitions.get(page)!;
            trans.set(nextPage, (trans.get(nextPage) ?? 0) + 1);

            if (!reverseTransitions.has(nextPage)) reverseTransitions.set(nextPage, new Map());
            const revTrans = reverseTransitions.get(nextPage)!;
            revTrans.set(page, (revTrans.get(page) ?? 0) + 1);

            // Track duration on page
            const duration = session.events[i + 1].timestamp - event.timestamp;
            if (!pageDurations.has(page)) pageDurations.set(page, []);
            pageDurations.get(page)!.push(duration);
          } else {
            // This is an exit page
            exitCounts.set(page, (exitCounts.get(page) ?? 0) + 1);
          }
        }
      }
    }

    // Build path nodes
    const nodes: PathNode[] = [];
    for (const [page, visits] of pageVisits.entries()) {
      const nextPages: PathTransition[] = [];
      const trans = transitions.get(page);
      if (trans) {
        const totalTransitions = Array.from(trans.values()).reduce((a, b) => a + b, 0);
        for (const [target, count] of trans.entries()) {
          nextPages.push({
            targetPage: target,
            count,
            percentage: totalTransitions > 0 ? count / totalTransitions : 0,
          });
        }
        nextPages.sort((a, b) => b.count - a.count);
      }

      const previousPages: PathTransition[] = [];
      const revTrans = reverseTransitions.get(page);
      if (revTrans) {
        const totalRevTransitions = Array.from(revTrans.values()).reduce((a, b) => a + b, 0);
        for (const [target, count] of revTrans.entries()) {
          previousPages.push({
            targetPage: target,
            count,
            percentage: totalRevTransitions > 0 ? count / totalRevTransitions : 0,
          });
        }
        previousPages.sort((a, b) => b.count - a.count);
      }

      const exits = exitCounts.get(page) ?? 0;
      const durations = pageDurations.get(page) ?? [];
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      nodes.push({
        page,
        visits,
        nextPages,
        previousPages,
        exitRate: visits > 0 ? exits / visits : 0,
        averageDuration: avgDuration,
      });
    }

    nodes.sort((a, b) => b.visits - a.visits);
    return nodes;
  }

  /**
   * Get the complete journey for a specific user
   */
  public getUserJourney(userId: string): UserJourney | null {
    let sessions = this.sessions.get(userId);
    if (!sessions || sessions.length === 0) {
      // Try to reconstruct
      sessions = this.reconstructSession(userId);
      if (sessions.length === 0) return null;
    }

    const pagesVisited = new Set<string>();
    let totalEvents = 0;
    let totalDuration = 0;

    for (const session of sessions) {
      totalEvents += session.events.length;
      totalDuration += session.duration;
      for (const event of session.events) {
        pagesVisited.add(event.page);
      }
    }

    return {
      userId,
      sessions,
      totalEvents,
      firstSeen: sessions[0].startedAt,
      lastSeen: sessions[sessions.length - 1].endedAt,
      totalDuration,
      averageSessionDuration: sessions.length > 0 ? totalDuration / sessions.length : 0,
      pagesVisited,
    };
  }

  /**
   * Get session count per user
   */
  public getSessionCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [userId, sessions] of this.sessions.entries()) {
      counts.set(userId, sessions.length);
    }
    return counts;
  }

  /**
   * Build a UserSession from events
   */
  private buildSession(
    userId: string,
    events: SessionEvent[],
    startedAt: number,
    endedAt: number,
    deviceType: string,
    referrer: string,
    landingPage: string
  ): UserSession {
    return {
      sessionId: `session-${++this.sessionCounter}-${startedAt}`,
      userId,
      events,
      startedAt,
      endedAt,
      duration: endedAt - startedAt,
      deviceType,
      referrer,
      landingPage,
    };
  }

  /**
   * Check if an event matches a funnel step definition
   */
  private matchesFunnelStep(event: RawEvent, step: FunnelStep): boolean {
    if (event.type !== step.eventType) return false;

    if (step.conditions) {
      for (const [key, value] of Object.entries(step.conditions)) {
        if (key === 'name' && event.name !== value) return false;
        if (key === 'page' && event.page !== value) return false;
        if (event.properties[key] !== value) return false;
      }
    }

    return true;
  }
}
