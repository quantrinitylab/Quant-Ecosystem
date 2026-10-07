import { describe, it, expect, vi } from 'vitest';
import { ActionExecutor } from './action-executor';
import type { AuditLogWriter } from './action-executor';

describe('ActionExecutor', () => {
  it('creates audit log entry for every action', async () => {
    const auditLogWriter: AuditLogWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const executor = new ActionExecutor({ auditLogWriter });

    await executor.execute({
      action: 'flag',
      contentId: 'content-1',
      userId: 'user-1',
      severity: 'medium',
      reason: 'Flagged by ML classifier',
      classificationResult: { score: 0.75 },
    });

    expect(auditLogWriter.write).toHaveBeenCalledTimes(1);
    expect(auditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'system:moderation-worker',
        action: 'moderation.flag',
        resourceType: 'content',
        resourceId: 'content-1',
      }),
    );
  });

  it('executes remove action with correct parameters', async () => {
    const auditLogWriter: AuditLogWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const executor = new ActionExecutor({ auditLogWriter });

    const result = await executor.execute({
      action: 'remove',
      contentId: 'content-2',
      userId: 'user-2',
      severity: 'high',
      reason: 'NSFW content detected',
      classificationResult: { score: 0.95 },
    });

    expect(result.executed).toBe(true);
    expect(result.action).toBe('remove');
    expect(result.auditLogId).toBeDefined();
    expect(result.timestamp).toBeGreaterThan(0);
    expect(auditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.remove',
        resourceId: 'content-2',
        diff: expect.objectContaining({
          action: 'remove',
          userId: 'user-2',
          severity: 'high',
          reason: 'NSFW content detected',
        }),
      }),
    );
  });

  it('executes ban action with correct parameters', async () => {
    const auditLogWriter: AuditLogWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const executor = new ActionExecutor({ auditLogWriter });

    const result = await executor.execute({
      action: 'ban',
      contentId: 'content-3',
      userId: 'user-3',
      severity: 'critical',
      reason: 'Repeated policy violations',
      classificationResult: { score: 0.99 },
    });

    expect(result.executed).toBe(true);
    expect(result.action).toBe('ban');
    expect(auditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.ban',
        resourceId: 'content-3',
        diff: expect.objectContaining({
          action: 'ban',
          userId: 'user-3',
          severity: 'critical',
        }),
      }),
    );
  });

  it('executes warn action with correct parameters', async () => {
    const auditLogWriter: AuditLogWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const executor = new ActionExecutor({ auditLogWriter });

    const result = await executor.execute({
      action: 'warn',
      contentId: 'content-4',
      userId: 'user-4',
      severity: 'low',
      reason: 'Borderline content detected',
      classificationResult: { score: 0.55 },
    });

    expect(result.executed).toBe(true);
    expect(result.action).toBe('warn');
    expect(auditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.warn',
        resourceId: 'content-4',
        diff: expect.objectContaining({
          action: 'warn',
          userId: 'user-4',
          severity: 'low',
          reason: 'Borderline content detected',
        }),
      }),
    );
  });
});
