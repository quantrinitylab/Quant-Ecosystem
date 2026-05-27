import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniversalTimelineService } from '../timeline-service';
import { TimelineAggregator } from '../timeline-aggregator';
import type { TimelineEvent, TimelineSource } from '../types';

describe('UniversalTimelineService', () => {
  let service: UniversalTimelineService;

  beforeEach(() => {
    service = new UniversalTimelineService();
  });

  it('publishes an event and assigns id and timestamp', () => {
    const event = service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'New message',
      description: 'User sent a message',
      importance: 'medium',
    });

    expect(event.id).toMatch(/^tl_/);
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.title).toBe('New message');
  });

  it('filters events by app', () => {
    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'Chat event',
      description: 'desc',
      importance: 'low',
    });
    service.publish({
      userId: 'user1',
      app: 'quantmail',
      type: 'email',
      title: 'Mail event',
      description: 'desc',
      importance: 'medium',
    });

    const results = service.query({ apps: ['quantchat'], userId: 'user1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.app).toBe('quantchat');
  });

  it('filters events by time range', () => {
    const now = Date.now();
    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'Recent',
      description: 'desc',
      importance: 'low',
    });

    const results = service.query({ userId: 'user1', after: now - 1000 });
    expect(results.length).toBeGreaterThan(0);

    const oldResults = service.query({ userId: 'user1', before: now - 10000 });
    expect(oldResults).toHaveLength(0);
  });

  it('filters events by importance', () => {
    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'alert',
      title: 'Critical alert',
      description: 'desc',
      importance: 'critical',
    });
    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'info',
      title: 'Info event',
      description: 'desc',
      importance: 'low',
    });

    const results = service.query({ userId: 'user1', importance: ['critical'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.importance).toBe('critical');
  });

  it('supports pagination with limit', () => {
    for (let i = 0; i < 10; i++) {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'message',
        title: `Event ${i}`,
        description: 'desc',
        importance: 'low',
      });
    }

    const results = service.query({ userId: 'user1', limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('notifies subscribers on new events', () => {
    const callback = vi.fn();
    service.subscribe('user1', callback);

    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'Hello',
      description: 'desc',
      importance: 'medium',
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello' }));
  });

  it('unsubscribes from realtime updates', () => {
    const callback = vi.fn();
    const unsubscribe = service.subscribe('user1', callback);

    unsubscribe();

    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'After unsub',
      description: 'desc',
      importance: 'low',
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('queries with sources for multi-source aggregation', async () => {
    const mockSource: TimelineSource = {
      name: 'external',
      app: 'quantmail',
      fetchEvents: vi.fn().mockResolvedValue([
        {
          id: 'ext_1',
          userId: 'user1',
          app: 'quantmail',
          type: 'email',
          title: 'External email',
          description: 'desc',
          timestamp: Date.now(),
          importance: 'high' as const,
        },
      ]),
    };

    service.registerSource(mockSource);
    service.publish({
      userId: 'user1',
      app: 'quantchat',
      type: 'message',
      title: 'Local msg',
      description: 'desc',
      importance: 'low',
    });

    const results = await service.queryWithSources({ userId: 'user1' });
    expect(results).toHaveLength(2);
  });
});

describe('TimelineAggregator', () => {
  let aggregator: TimelineAggregator;

  beforeEach(() => {
    aggregator = new TimelineAggregator();
  });

  it('deduplicates events by id', () => {
    const events: TimelineEvent[] = [
      {
        id: 'evt1',
        userId: 'user1',
        app: 'quantchat',
        type: 'message',
        title: 'Hello',
        description: 'desc',
        timestamp: 1000,
        importance: 'low',
      },
      {
        id: 'evt1',
        userId: 'user1',
        app: 'quantchat',
        type: 'message',
        title: 'Hello duplicate',
        description: 'desc',
        timestamp: 1000,
        importance: 'low',
      },
      {
        id: 'evt2',
        userId: 'user1',
        app: 'quantmail',
        type: 'email',
        title: 'Mail',
        description: 'desc',
        timestamp: 2000,
        importance: 'medium',
      },
    ];

    const result = aggregator.deduplicate(events);
    expect(result).toHaveLength(2);
  });

  it('sorts events by timestamp descending', () => {
    const events: TimelineEvent[] = [
      {
        id: 'evt1',
        userId: 'user1',
        app: 'a',
        type: 't',
        title: 'Old',
        description: 'd',
        timestamp: 1000,
        importance: 'low',
      },
      {
        id: 'evt2',
        userId: 'user1',
        app: 'a',
        type: 't',
        title: 'New',
        description: 'd',
        timestamp: 3000,
        importance: 'low',
      },
      {
        id: 'evt3',
        userId: 'user1',
        app: 'a',
        type: 't',
        title: 'Mid',
        description: 'd',
        timestamp: 2000,
        importance: 'low',
      },
    ];

    const result = aggregator.aggregate(events, {});
    expect(result[0]!.title).toBe('New');
    expect(result[1]!.title).toBe('Mid');
    expect(result[2]!.title).toBe('Old');
  });
});
