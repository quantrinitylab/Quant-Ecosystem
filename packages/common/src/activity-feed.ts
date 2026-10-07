// ============================================================================
// Activity Feed Service - Cross-App Activity Stream
// ============================================================================

export type ActivityType =
  | 'post'
  | 'share'
  | 'comment'
  | 'like'
  | 'follow'
  | 'upload'
  | 'create'
  | 'achievement';

export interface Activity {
  id: string;
  userId: string;
  app: string;
  type: ActivityType;
  title: string;
  description: string;
  targetUrl?: string;
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface ActivityFeedOptions {
  apps?: string[];
  types?: ActivityType[];
  limit?: number;
  before?: number;
}

type ActivityCallback = (activity: Activity) => void;

export class ActivityFeedService {
  private activities: Map<string, Activity> = new Map();
  private subscribers: Map<string, ActivityCallback[]> = new Map();
  private counter = 0;

  publish(activity: Omit<Activity, 'id' | 'timestamp'>): Activity {
    const id = `activity_${Date.now()}_${++this.counter}`;
    const full: Activity = {
      ...activity,
      id,
      timestamp: Date.now(),
    };
    this.activities.set(id, full);

    // Notify subscribers
    const callbacks = this.subscribers.get(activity.userId) ?? [];
    for (const cb of callbacks) {
      cb(full);
    }

    return full;
  }

  getTimeline(userId: string, options?: ActivityFeedOptions): Activity[] {
    return this.filterActivities(userId, options);
  }

  getActivities(userId: string, options?: ActivityFeedOptions): Activity[] {
    return this.filterActivities(userId, options);
  }

  subscribe(userId: string, callback: ActivityCallback): () => void {
    const existing = this.subscribers.get(userId) ?? [];
    existing.push(callback);
    this.subscribers.set(userId, existing);

    return () => {
      const callbacks = this.subscribers.get(userId);
      if (callbacks) {
        const idx = callbacks.indexOf(callback);
        if (idx >= 0) {
          callbacks.splice(idx, 1);
        }
      }
    };
  }

  getAppActivity(app: string, limit?: number): Activity[] {
    const results = Array.from(this.activities.values())
      .filter((a) => a.app === app)
      .sort((a, b) => b.timestamp - a.timestamp);

    return limit ? results.slice(0, limit) : results;
  }

  deleteActivity(activityId: string): boolean {
    return this.activities.delete(activityId);
  }

  getStats(userId: string): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [, activity] of this.activities) {
      if (activity.userId === userId) {
        stats[activity.type] = (stats[activity.type] ?? 0) + 1;
      }
    }
    return stats;
  }

  clearOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, activity] of this.activities) {
      if (activity.timestamp < cutoff) {
        this.activities.delete(id);
        count++;
      }
    }
    return count;
  }

  private filterActivities(userId: string, options?: ActivityFeedOptions): Activity[] {
    let results = Array.from(this.activities.values()).filter((a) => a.userId === userId);

    if (options?.apps) {
      const apps = options.apps;
      results = results.filter((a) => apps.includes(a.app));
    }

    if (options?.types) {
      const types = options.types;
      results = results.filter((a) => types.includes(a.type));
    }

    if (options?.before) {
      const before = options.before;
      results = results.filter((a) => a.timestamp < before);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }
}
