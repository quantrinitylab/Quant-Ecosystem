import { describe, it, expect } from 'vitest';
import { AppealWorkflow } from './appeal-workflow';
import type { ModerationResult } from '../types';

function createModerationResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'mod_test_1',
    contentId: 'content-1',
    contentType: 'text',
    categories: [{ category: 'hate_speech', score: 0.85, confidence: 0.9, detected: true }],
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

describe('AppealWorkflow', () => {
  it('should create an AppealRecord from a moderation action', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');

    expect(record.id).toMatch(/^ar_/);
    expect(record.contentId).toBe('content-1');
    expect(record.userId).toBe('user-1');
    expect(record.originalAction).toBe('flag');
    expect(record.status).toBe('submitted');
    expect(record.evidence).toContain('hate_speech: score=0.85');
    expect(record.createdAt).toBeDefined();
  });

  it('should submit a user-initiated appeal', () => {
    const workflow = new AppealWorkflow();
    const record = workflow.submitAppeal({
      contentId: 'content-2',
      userId: 'user-2',
      originalAction: 'remove',
      reason: 'I think this was wrongly flagged',
      evidence: ['screenshot.png'],
    });

    expect(record.contentId).toBe('content-2');
    expect(record.reason).toBe('I think this was wrongly flagged');
    expect(record.evidence).toContain('screenshot.png');
    expect(record.status).toBe('submitted');
  });

  it('should assign an appeal to a reviewer', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');

    const assigned = workflow.assign(record.id, 'reviewer-1');

    expect(assigned.assignedTo).toBe('reviewer-1');
    expect(assigned.status).toBe('human_review');
  });

  it('should resolve an appeal as approved', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');

    const resolved = workflow.resolve(record.id, {
      status: 'approved',
      resolution: 'Content does not violate policy',
    });

    expect(resolved.status).toBe('approved');
    expect(resolved.resolution).toBe('Content does not violate policy');
    expect(resolved.resolvedAt).toBeDefined();
  });

  it('should resolve an appeal as denied', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');

    const resolved = workflow.resolve(record.id, {
      status: 'denied',
      resolution: 'Content clearly violates hate speech policy',
    });

    expect(resolved.status).toBe('denied');
    expect(resolved.resolution).toBe('Content clearly violates hate speech policy');
  });

  it('should throw when resolving already resolved appeal', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');

    workflow.resolve(record.id, { status: 'approved', resolution: 'ok' });

    expect(() =>
      workflow.resolve(record.id, { status: 'denied', resolution: 'changed mind' }),
    ).toThrow('Appeal is already resolved');
  });

  it('should enforce max appeals per user', () => {
    const workflow = new AppealWorkflow({ maxAppealsPerUser: 2, cooldownDays: 30 });

    workflow.submitAppeal({
      contentId: 'c1',
      userId: 'user-x',
      originalAction: 'remove',
      reason: 'r1',
    });
    workflow.submitAppeal({
      contentId: 'c2',
      userId: 'user-x',
      originalAction: 'remove',
      reason: 'r2',
    });

    expect(() =>
      workflow.submitAppeal({
        contentId: 'c3',
        userId: 'user-x',
        originalAction: 'remove',
        reason: 'r3',
      }),
    ).toThrow('Maximum appeals (2) reached within cooldown period');
  });

  it('should not count automated records toward user appeal quota', () => {
    const workflow = new AppealWorkflow({ maxAppealsPerUser: 2, cooldownDays: 30 });
    const result = createModerationResult();

    // Create several automated records
    workflow.createFromAction(result, 'user-y');
    workflow.createFromAction(result, 'user-y');
    workflow.createFromAction(result, 'user-y');
    workflow.createFromAction(result, 'user-y');

    // User should still be able to submit manual appeals
    const appeal = workflow.submitAppeal({
      contentId: 'c1',
      userId: 'user-y',
      originalAction: 'remove',
      reason: 'Wrongly flagged',
    });
    expect(appeal.source).toBe('user_initiated');

    // Submit one more to reach quota
    workflow.submitAppeal({
      contentId: 'c2',
      userId: 'user-y',
      originalAction: 'remove',
      reason: 'Also wrongly flagged',
    });

    // Now quota should be exhausted
    expect(() =>
      workflow.submitAppeal({
        contentId: 'c3',
        userId: 'user-y',
        originalAction: 'remove',
        reason: 'Third attempt',
      }),
    ).toThrow('Maximum appeals (2) reached within cooldown period');
  });

  it('should set source to automated for createFromAction records', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    const record = workflow.createFromAction(result, 'user-1');
    expect(record.source).toBe('automated');
  });

  it('should set source to user_initiated for submitAppeal records', () => {
    const workflow = new AppealWorkflow();
    const record = workflow.submitAppeal({
      contentId: 'c1',
      userId: 'user-1',
      originalAction: 'remove',
      reason: 'test',
    });
    expect(record.source).toBe('user_initiated');
  });

  it('should get all records for a user', () => {
    const workflow = new AppealWorkflow();
    const result = createModerationResult();
    workflow.createFromAction(result, 'user-1');
    workflow.createFromAction(result, 'user-1');
    workflow.createFromAction(result, 'user-2');

    const user1Records = workflow.getRecordsForUser('user-1');
    const user2Records = workflow.getRecordsForUser('user-2');

    expect(user1Records).toHaveLength(2);
    expect(user2Records).toHaveLength(1);
  });

  it('should throw on non-existent record', () => {
    const workflow = new AppealWorkflow();
    expect(() => workflow.assign('non-existent', 'reviewer')).toThrow('Appeal record not found');
  });
});
