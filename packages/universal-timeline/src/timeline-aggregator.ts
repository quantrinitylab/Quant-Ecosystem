// ============================================================================
// Timeline Aggregator - Merges, deduplicates, filters, and sorts events
// ============================================================================

import type { TimelineEvent, TimelineFilter } from './types';

export class TimelineAggregator {
  aggregate(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
    const deduplicated = this.deduplicate(events);
    const filtered = this.applyFilters(deduplicated, filter);
    const sorted = this.sortByTimestamp(filtered);
    return this.applyPagination(sorted, filter);
  }

  deduplicate(events: TimelineEvent[]): TimelineEvent[] {
    const seen = new Map<string, TimelineEvent>();
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.set(event.id, event);
      }
    }
    return Array.from(seen.values());
  }

  private applyFilters(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
    let result = events;

    if (filter.userId) {
      const userId = filter.userId;
      result = result.filter((e) => e.userId === userId);
    }

    if (filter.apps && filter.apps.length > 0) {
      const apps = filter.apps;
      result = result.filter((e) => apps.includes(e.app));
    }

    if (filter.types && filter.types.length > 0) {
      const types = filter.types;
      result = result.filter((e) => types.includes(e.type));
    }

    if (filter.importance && filter.importance.length > 0) {
      const importance = filter.importance;
      result = result.filter((e) => importance.includes(e.importance));
    }

    if (filter.before != null) {
      const before = filter.before;
      result = result.filter((e) => e.timestamp < before);
    }

    if (filter.after != null) {
      const after = filter.after;
      result = result.filter((e) => e.timestamp > after);
    }

    return result;
  }

  private sortByTimestamp(events: TimelineEvent[]): TimelineEvent[] {
    return [...events].sort((a, b) => b.timestamp - a.timestamp);
  }

  private applyPagination(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
    if (filter.limit != null && filter.limit > 0) {
      return events.slice(0, filter.limit);
    }
    return events;
  }
}
