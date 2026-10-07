// ============================================================================
// Feature Store - Real-Time Feature Aggregator
// ============================================================================

import type { OnlineFeatureStore } from './online-store';

export type EventType = 'view' | 'click' | 'like' | 'share' | 'dwell' | 'dismiss';

export interface UserEvent {
  userId: string;
  eventType: EventType;
  itemId: string;
  topicId?: string;
  durationMs?: number;
  timestamp: number;
}

export interface AggregatedFeatures {
  total_views_1h: number;
  total_views_24h: number;
  click_through_rate: number;
  avg_dwell_time: number;
  topic_affinity_vector: number[];
  session_count_7d: number;
}

interface UserAggregateState {
  events: UserEvent[];
  dirty: boolean;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TOPIC_VECTOR_SIZE = 10;
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes gap defines new session

export class FeatureAggregator {
  private readonly onlineStore: OnlineFeatureStore;
  private readonly userStates: Map<string, UserAggregateState> = new Map();

  constructor(onlineStore: OnlineFeatureStore) {
    this.onlineStore = onlineStore;
  }

  processEvent(event: UserEvent): void {
    let state = this.userStates.get(event.userId);
    if (!state) {
      state = { events: [], dirty: false };
      this.userStates.set(event.userId, state);
    }
    state.events.push(event);
    state.dirty = true;

    // Prune events older than 7 days to prevent unbounded memory growth
    const cutoff = event.timestamp - SEVEN_DAYS_MS;
    if (state.events.length > 100 && state.events[0]!.timestamp < cutoff) {
      state.events = state.events.filter((e) => e.timestamp >= cutoff);
    }
  }

  getAggregatedFeatures(userId: string, now?: number): AggregatedFeatures {
    const currentTime = now ?? Date.now();
    const state = this.userStates.get(userId);

    if (!state || state.events.length === 0) {
      return {
        total_views_1h: 0,
        total_views_24h: 0,
        click_through_rate: 0,
        avg_dwell_time: 0,
        topic_affinity_vector: new Array(TOPIC_VECTOR_SIZE).fill(0),
        session_count_7d: 0,
      };
    }

    const events = state.events;

    // Sliding window filters
    const events1h = events.filter((e) => currentTime - e.timestamp <= ONE_HOUR_MS);
    const events24h = events.filter((e) => currentTime - e.timestamp <= TWENTY_FOUR_HOURS_MS);
    const events7d = events.filter((e) => currentTime - e.timestamp <= SEVEN_DAYS_MS);

    // Total views in 1h and 24h
    const total_views_1h = events1h.filter((e) => e.eventType === 'view').length;
    const total_views_24h = events24h.filter((e) => e.eventType === 'view').length;

    // Click-through rate: clicks / views in 24h window
    const views24h = events24h.filter((e) => e.eventType === 'view').length;
    const clicks24h = events24h.filter((e) => e.eventType === 'click').length;
    const click_through_rate = views24h > 0 ? clicks24h / views24h : 0;

    // Average dwell time from dwell events in 24h window
    const dwellEvents = events24h.filter(
      (e) => e.eventType === 'dwell' && e.durationMs !== undefined,
    );
    const avg_dwell_time =
      dwellEvents.length > 0
        ? dwellEvents.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / dwellEvents.length
        : 0;

    // Topic affinity vector (10-dim): count interactions per topic, normalize
    const topicCounts = new Array(TOPIC_VECTOR_SIZE).fill(0) as number[];
    for (const event of events24h) {
      if (event.topicId) {
        const idx = Math.abs(hashString(event.topicId)) % TOPIC_VECTOR_SIZE;
        topicCounts[idx] = (topicCounts[idx] ?? 0) + 1;
      }
    }
    const maxCount = Math.max(...topicCounts, 1);
    const topic_affinity_vector = topicCounts.map((c) => c / maxCount);

    // Session count in 7 days: count distinct sessions based on 30-min gap
    const session_count_7d = countSessions(events7d, SESSION_GAP_MS);

    return {
      total_views_1h,
      total_views_24h,
      click_through_rate,
      avg_dwell_time,
      topic_affinity_vector,
      session_count_7d,
    };
  }

  async flushToOnlineStore(): Promise<number> {
    let flushedCount = 0;

    for (const [userId, state] of this.userStates.entries()) {
      if (!state.dirty) continue;

      try {
        const features = this.getAggregatedFeatures(userId);
        await this.onlineStore.setFeatures(userId, features as unknown as Record<string, unknown>);
        state.dirty = false;
        flushedCount++;
      } catch {
        // Skip this user on failure; they remain dirty and will be retried on next flush
      }
    }

    return flushedCount;
  }

  getUserIds(): string[] {
    return Array.from(this.userStates.keys());
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}

function countSessions(events: UserEvent[], gapMs: number): number {
  if (events.length === 0) return 0;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  let sessions = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.timestamp - sorted[i - 1]!.timestamp > gapMs) {
      sessions++;
    }
  }

  return sessions;
}
