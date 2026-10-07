import { describe, it, expect } from 'vitest';
import { TransparencyReportGenerator } from './transparency-report';
import type { AppealRecord, ModerationResult } from '../types';

function createModerationResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'mod_1',
    contentId: 'content-1',
    contentType: 'text',
    categories: [
      { category: 'hate_speech', score: 0.85, confidence: 0.9, detected: true },
      { category: 'harassment', score: 0.3, confidence: 0.8, detected: false },
    ],
    overallScore: 0.85,
    action: 'flag',
    confidence: 0.9,
    automated: true,
    flags: ['hate_speech'],
    metadata: {},
    createdAt: Date.now(),
    ...overrides,
  };
}

function createAppealRecord(overrides: Partial<AppealRecord> = {}): AppealRecord {
  return {
    id: 'ar_1',
    contentId: 'content-1',
    userId: 'user-1',
    originalAction: 'flag',
    reason: 'test',
    evidence: [],
    status: 'submitted',
    source: 'user_initiated',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('TransparencyReportGenerator', () => {
  it('should generate a report with moderation stats', () => {
    const generator = new TransparencyReportGenerator();
    const now = Date.now();
    const startDate = now - 86400000; // 1 day ago
    const endDate = now + 1000;

    generator.recordAction(createModerationResult({ createdAt: now }));
    generator.recordAction(
      createModerationResult({
        id: 'mod_2',
        createdAt: now,
        categories: [{ category: 'nsfw', score: 0.9, confidence: 0.95, detected: true }],
      }),
    );

    const report = generator.generate(startDate, endDate);

    expect(report.totalActions).toBe(2);
    expect(report.actionsByCategory['hate_speech']).toBe(1);
    expect(report.actionsByCategory['nsfw']).toBe(1);
    expect(report.startDate).toBe(startDate);
    expect(report.endDate).toBe(endDate);
  });

  it('should generate appeal stats', () => {
    const generator = new TransparencyReportGenerator();
    const now = Date.now();
    const startDate = now - 86400000;
    const endDate = now + 1000;

    generator.recordAppeal(
      createAppealRecord({ createdAt: now, status: 'approved', resolvedAt: now + 5000 }),
    );
    generator.recordAppeal(
      createAppealRecord({ id: 'ar_2', createdAt: now, status: 'denied', resolvedAt: now + 3000 }),
    );
    generator.recordAppeal(createAppealRecord({ id: 'ar_3', createdAt: now, status: 'submitted' }));

    const report = generator.generate(startDate, endDate);

    expect(report.appealStats.submitted).toBe(3);
    expect(report.appealStats.approved).toBe(1);
    expect(report.appealStats.denied).toBe(1);
    expect(report.avgResolutionTime).toBe(4000); // (5000 + 3000) / 2
  });

  it('should filter by date range', () => {
    const generator = new TransparencyReportGenerator();
    const now = Date.now();

    generator.recordAction(createModerationResult({ createdAt: now - 100000 }));
    generator.recordAction(createModerationResult({ id: 'mod_2', createdAt: now }));

    const report = generator.generate(now - 1000, now + 1000);

    expect(report.totalActions).toBe(1);
  });

  it('should return top categories sorted by count', () => {
    const generator = new TransparencyReportGenerator();
    const now = Date.now();
    const startDate = now - 1000;
    const endDate = now + 1000;

    // 3 hate_speech actions
    generator.recordAction(createModerationResult({ id: 'a', createdAt: now }));
    generator.recordAction(createModerationResult({ id: 'b', createdAt: now }));
    generator.recordAction(createModerationResult({ id: 'c', createdAt: now }));
    // 1 nsfw action
    generator.recordAction(
      createModerationResult({
        id: 'd',
        createdAt: now,
        categories: [{ category: 'nsfw', score: 0.9, confidence: 0.9, detected: true }],
      }),
    );

    const report = generator.generate(startDate, endDate);

    expect(report.topCategories[0]?.category).toBe('hate_speech');
    expect(report.topCategories[0]?.count).toBe(3);
    expect(report.topCategories[1]?.category).toBe('nsfw');
    expect(report.topCategories[1]?.count).toBe(1);
  });

  it('should handle empty data', () => {
    const generator = new TransparencyReportGenerator();
    const report = generator.generate(0, Date.now());

    expect(report.totalActions).toBe(0);
    expect(report.appealStats.submitted).toBe(0);
    expect(report.avgResolutionTime).toBe(0);
    expect(report.topCategories).toHaveLength(0);
  });

  it('should evict oldest records when maxRecords is exceeded', () => {
    const generator = new TransparencyReportGenerator({ maxRecords: 3 });
    const now = Date.now();

    // Add 5 actions, only the last 3 should be kept
    generator.recordAction(createModerationResult({ id: 'old_1', createdAt: now - 5000 }));
    generator.recordAction(createModerationResult({ id: 'old_2', createdAt: now - 4000 }));
    generator.recordAction(createModerationResult({ id: 'kept_1', createdAt: now - 3000 }));
    generator.recordAction(createModerationResult({ id: 'kept_2', createdAt: now - 2000 }));
    generator.recordAction(createModerationResult({ id: 'kept_3', createdAt: now - 1000 }));

    const report = generator.generate(now - 10000, now + 1000);
    // Only the 3 most recent should remain
    expect(report.totalActions).toBe(3);
  });

  it('should evict oldest appeal records when maxRecords is exceeded', () => {
    const generator = new TransparencyReportGenerator({ maxRecords: 2 });
    const now = Date.now();

    generator.recordAppeal(createAppealRecord({ id: 'old_a', createdAt: now - 3000 }));
    generator.recordAppeal(createAppealRecord({ id: 'kept_a', createdAt: now - 2000 }));
    generator.recordAppeal(createAppealRecord({ id: 'kept_b', createdAt: now - 1000 }));

    const report = generator.generate(now - 10000, now + 1000);
    expect(report.appealStats.submitted).toBe(2);
  });

  it('should default to 100000 maxRecords', () => {
    // Just verify the constructor works without config
    const generator = new TransparencyReportGenerator();
    expect(generator).toBeDefined();
  });
});
