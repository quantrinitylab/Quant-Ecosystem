import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DailyBriefGenerator } from '../brief-generator';
import { PriorityScorer } from '../priority-scorer';
import { AnomalyDetector } from '../anomaly-detector';
import type { BriefItem, DataProvider } from '../types';

describe('DailyBriefGenerator', () => {
  let generator: DailyBriefGenerator;

  beforeEach(() => {
    generator = new DailyBriefGenerator();
  });

  it('generates an empty brief when no providers are registered', async () => {
    const brief = await generator.generate('user1');

    expect(brief.id).toMatch(/^brief_/);
    expect(brief.userId).toBe('user1');
    expect(brief.sections).toHaveLength(0);
    expect(brief.overallPriority).toBe('low');
  });

  it('generates a brief with deadline items', async () => {
    const provider: DataProvider = {
      name: 'tasks',
      app: 'quantdocs',
      fetchItems: vi.fn().mockResolvedValue([
        {
          id: 'item1',
          title: 'Submit report',
          description: 'Due soon',
          dueAt: Date.now() + 3600000,
          sourceApp: 'quantdocs',
          priority: 'high' as const,
        },
      ]),
    };

    generator.registerProvider(provider);
    const brief = await generator.generate('user1');

    expect(brief.sections.length).toBeGreaterThan(0);
    const deadlineSection = brief.sections.find((s) => s.type === 'deadlines');
    expect(deadlineSection).toBeDefined();
    expect(deadlineSection!.items).toHaveLength(1);
  });

  it('registers and unregisters data providers', () => {
    const provider: DataProvider = {
      name: 'mail',
      app: 'quantmail',
      fetchItems: vi.fn().mockResolvedValue([]),
    };

    generator.registerProvider(provider);
    const removed = generator.unregisterProvider('mail');
    expect(removed).toBe(true);

    const removedAgain = generator.unregisterProvider('mail');
    expect(removedAgain).toBe(false);
  });

  it('generates a full brief with mixed data from multiple providers', async () => {
    const taskProvider: DataProvider = {
      name: 'tasks',
      app: 'quantdocs',
      fetchItems: vi.fn().mockResolvedValue([
        {
          id: 'task1',
          title: 'Review PR',
          description: 'Code review',
          sourceApp: 'quantdocs',
          priority: 'medium' as const,
        },
      ]),
    };
    const mailProvider: DataProvider = {
      name: 'mail',
      app: 'quantmail',
      fetchItems: vi.fn().mockResolvedValue([
        {
          id: 'mail1',
          title: 'Important email',
          description: 'From CEO',
          sourceApp: 'quantmail',
          priority: 'high' as const,
        },
      ]),
    };

    generator.registerProvider(taskProvider);
    generator.registerProvider(mailProvider);

    const brief = await generator.generate('user1');
    expect(brief.sections.length).toBeGreaterThanOrEqual(2);
  });

  it('orders sections by urgency descending', async () => {
    const provider: DataProvider = {
      name: 'mixed',
      app: 'system',
      fetchItems: vi.fn().mockResolvedValue([
        {
          id: 'low1',
          title: 'Low item',
          description: 'desc',
          sourceApp: 'quantdocs',
          priority: 'low' as const,
        },
        {
          id: 'high1',
          title: 'Critical deadline',
          description: 'urgent deadline',
          dueAt: Date.now() - 1000,
          sourceApp: 'quantdocs',
          priority: 'critical' as const,
        },
      ]),
    };

    generator.registerProvider(provider);
    const brief = await generator.generate('user1');

    // Sections should be sorted by urgency - higher urgency first
    if (brief.sections.length >= 2) {
      expect(brief.sections[0]!.urgency).toBeGreaterThanOrEqual(brief.sections[1]!.urgency);
    }
  });
});

describe('PriorityScorer', () => {
  let scorer: PriorityScorer;

  beforeEach(() => {
    scorer = new PriorityScorer();
  });

  it('scores critical items higher than low items', () => {
    const criticalItem: BriefItem = {
      id: '1',
      title: 'Critical task',
      description: 'Very important',
      sourceApp: 'quantdocs',
      priority: 'critical',
    };
    const lowItem: BriefItem = {
      id: '2',
      title: 'Low task',
      description: 'Not urgent',
      sourceApp: 'quantdocs',
      priority: 'low',
    };

    const criticalScore = scorer.score(criticalItem);
    const lowScore = scorer.score(lowItem);
    expect(criticalScore).toBeGreaterThan(lowScore);
  });

  it('increases score for items with approaching deadlines', () => {
    const soonItem: BriefItem = {
      id: '1',
      title: 'Due soon',
      description: 'desc',
      dueAt: Date.now() + 60 * 60 * 1000, // 1 hour
      sourceApp: 'quantdocs',
      priority: 'medium',
    };
    const laterItem: BriefItem = {
      id: '2',
      title: 'Due later',
      description: 'desc',
      dueAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      sourceApp: 'quantdocs',
      priority: 'medium',
    };

    expect(scorer.score(soonItem)).toBeGreaterThan(scorer.score(laterItem));
  });

  it('increases score for items with urgent keywords', () => {
    const urgentItem: BriefItem = {
      id: '1',
      title: 'URGENT: Fix production',
      description: 'Critical system down',
      sourceApp: 'quantdocs',
      priority: 'medium',
    };
    const normalItem: BriefItem = {
      id: '2',
      title: 'Update docs',
      description: 'Routine maintenance',
      sourceApp: 'quantdocs',
      priority: 'medium',
    };

    expect(scorer.score(urgentItem)).toBeGreaterThan(scorer.score(normalItem));
  });
});

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  it('detects missed deadlines', () => {
    const items: BriefItem[] = [
      {
        id: '1',
        title: 'Missed task',
        description: 'Was due yesterday',
        dueAt: Date.now() - 86400000,
        sourceApp: 'quantdocs',
        priority: 'high',
      },
    ];

    const anomalies = detector.detect(items);
    const missedDeadline = anomalies.find((a) => a.type === 'missed_deadline');
    expect(missedDeadline).toBeDefined();
    expect(missedDeadline!.description).toContain('Missed deadline');
  });

  it('detects message spikes above threshold', () => {
    detector.setMessageThreshold(5);

    const items: BriefItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `msg_${i}`,
      title: `Message ${i}`,
      description: 'desc',
      sourceApp: 'quantchat',
      priority: 'low' as const,
    }));

    const anomalies = detector.detect(items);
    const spike = anomalies.find((a) => a.type === 'message_spike');
    expect(spike).toBeDefined();
    expect(spike!.description).toContain('Unusual message volume');
  });

  it('does not detect spike when below threshold', () => {
    detector.setMessageThreshold(100);

    const items: BriefItem[] = [
      {
        id: 'msg1',
        title: 'Message 1',
        description: 'desc',
        sourceApp: 'quantchat',
        priority: 'low',
      },
    ];

    const anomalies = detector.detect(items);
    const spike = anomalies.find((a) => a.type === 'message_spike');
    expect(spike).toBeUndefined();
  });
});
