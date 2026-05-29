import { describe, it, expect } from 'vitest';
import { VoiceDailyBrief } from '../daily-brief/voice-daily-brief.js';
import type { DataSource } from '../daily-brief/voice-daily-brief.js';
import { AppAggregator } from '../daily-brief/app-aggregator.js';
import type { AggregatorSource } from '../daily-brief/app-aggregator.js';

describe('VoiceDailyBrief', () => {
  const makeSource = (appId: string, items: { title: string; priority: number }[]): DataSource => ({
    appId,
    fetchItems: async () =>
      items.map((item, i) => ({
        id: `${appId}-${i}`,
        title: item.title,
        description: `Desc for ${item.title}`,
        priority: item.priority,
      })),
  });

  it('generates brief from multiple sources', async () => {
    const brief = new VoiceDailyBrief();
    const result = await brief.generate('user1', [
      makeSource('mail', [{ title: 'Inbox item', priority: 5 }]),
      makeSource('calendar', [{ title: 'Meeting at 3pm', priority: 8 }]),
    ]);
    expect(result.userId).toBe('user1');
    expect(result.sections.length).toBe(2);
    expect(result.generatedAt).toBeGreaterThan(0);
  });

  it('converts brief to voice script', async () => {
    const brief = new VoiceDailyBrief();
    const result = await brief.generate('user1', [
      makeSource('mail', [{ title: 'New email from Bob', priority: 3 }]),
    ]);
    const script = brief.toVoiceScript(result);
    expect(script).toContain('daily brief');
    expect(script).toContain('mail');
    expect(script).toContain('New email from Bob');
  });

  it('priority ordering (critical first)', () => {
    const brief = new VoiceDailyBrief();
    const sections = [
      { type: 'tasks', title: 'Tasks', spoken: 'Low priority tasks.', itemCount: 3, urgency: 2 },
      { type: 'alerts', title: 'Alerts', spoken: 'Critical alerts.', itemCount: 1, urgency: 9 },
      { type: 'mail', title: 'Mail', spoken: 'Some emails.', itemCount: 5, urgency: 5 },
    ];
    const sorted = brief.prioritize(sections);
    expect(sorted[0]!.type).toBe('alerts');
    expect(sorted[1]!.type).toBe('mail');
    expect(sorted[2]!.type).toBe('tasks');
  });

  it('automation suggestions based on patterns', () => {
    const brief = new VoiceDailyBrief();
    const suggestions = brief.suggestAutomations([
      { app: 'mail', action: 'forward newsletters', frequency: 5 },
      { app: 'calendar', action: 'check schedule', frequency: 1 },
      { app: 'drive', action: 'backup documents', frequency: 7 },
    ]);
    expect(suggestions.length).toBe(2);
    expect(suggestions[0]).toContain('mail');
    expect(suggestions[1]).toContain('drive');
  });

  it('handles empty sources gracefully', async () => {
    const brief = new VoiceDailyBrief();
    const result = await brief.generate('user1', []);
    expect(result.sections.length).toBe(0);
    expect(result.closingRemarks).toContain('nothing urgent');
  });

  it('includes greeting and closing remarks', async () => {
    const brief = new VoiceDailyBrief();
    const result = await brief.generate('user1', [
      makeSource('chat', [{ title: 'New message', priority: 4 }]),
    ]);
    expect(result.greeting).toContain('daily brief');
    expect(result.closingRemarks).toContain('1 items');
  });

  it('estimates duration based on content', async () => {
    const brief = new VoiceDailyBrief();
    const result = await brief.generate('user1', [
      makeSource('mail', [
        { title: 'Long email subject that takes time to read', priority: 5 },
        { title: 'Another email about the quarterly report', priority: 3 },
      ]),
    ]);
    expect(result.estimatedDurationSec).toBeGreaterThan(0);
  });
});

describe('AppAggregator', () => {
  it('registers and removes sources', () => {
    const agg = new AppAggregator();
    const source: AggregatorSource = {
      appId: 'mail',
      name: 'QuantMail',
      fetch: async () => [],
    };
    agg.registerSource(source);
    expect(agg.getRegisteredApps()).toContain('mail');
    agg.removeSource('mail');
    expect(agg.getRegisteredApps()).not.toContain('mail');
  });

  it('fetches from all registered sources', async () => {
    const agg = new AppAggregator();
    agg.registerSource({
      appId: 'mail',
      name: 'Mail',
      fetch: async () => [
        {
          id: '1',
          appId: 'mail',
          title: 'Email',
          description: '',
          priority: 'high',
          timestamp: 100,
          actionable: true,
        },
      ],
    });
    agg.registerSource({
      appId: 'chat',
      name: 'Chat',
      fetch: async () => [
        {
          id: '2',
          appId: 'chat',
          title: 'Message',
          description: '',
          priority: 'low',
          timestamp: 200,
          actionable: false,
        },
      ],
    });
    const items = await agg.fetchAll('user1');
    expect(items.length).toBe(2);
  });

  it('merges and sorts by priority then timestamp', () => {
    const agg = new AppAggregator();
    const merged = agg.merge([
      [
        {
          id: '1',
          appId: 'a',
          title: 'Low',
          description: '',
          priority: 'low',
          timestamp: 300,
          actionable: false,
        },
      ],
      [
        {
          id: '2',
          appId: 'b',
          title: 'Critical',
          description: '',
          priority: 'critical',
          timestamp: 100,
          actionable: true,
        },
      ],
      [
        {
          id: '3',
          appId: 'c',
          title: 'High',
          description: '',
          priority: 'high',
          timestamp: 200,
          actionable: true,
        },
      ],
    ]);
    expect(merged[0]!.priority).toBe('critical');
    expect(merged[1]!.priority).toBe('high');
    expect(merged[2]!.priority).toBe('low');
  });

  it('returns false for removing non-existent source', () => {
    const agg = new AppAggregator();
    expect(agg.removeSource('nonexistent')).toBe(false);
  });
});
