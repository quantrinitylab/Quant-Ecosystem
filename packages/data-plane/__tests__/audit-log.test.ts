import { describe, it, expect, vi } from 'vitest';
import { AuditLogger } from '../src/audit-log.js';

describe('AuditLogger', () => {
  const logger = new AuditLogger();

  function createMockTx() {
    return {
      auditLog: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'audit-1',
            ...data,
            createdAt: new Date(),
          }),
        ),
      },
    };
  }

  function createMockClient() {
    return {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'audit-1',
            actorId: 'user-1',
            action: 'create',
            resourceType: 'Post',
            resourceId: 'post-1',
            diff: { before: {}, after: { title: 'New Post' } },
            ipAddress: '127.0.0.1',
            userAgent: 'test-agent',
            createdAt: new Date(),
          },
        ]),
      },
    };
  }

  describe('log', () => {
    it('should create an audit log record with correct fields', async () => {
      const mockTx = createMockTx();

      const result = await logger.log(mockTx as never, {
        actorId: 'user-1',
        action: 'update',
        resourceType: 'Post',
        resourceId: 'post-123',
        diff: { before: { title: 'Old' }, after: { title: 'New' } },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.id).toBe('audit-1');
      expect(result.actorId).toBe('user-1');
      expect(result.action).toBe('update');
      expect(result.resourceType).toBe('Post');
      expect(result.resourceId).toBe('post-123');
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          action: 'update',
          resourceType: 'Post',
          resourceId: 'post-123',
          diff: { before: { title: 'Old' }, after: { title: 'New' } },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should handle optional fields', async () => {
      const mockTx = createMockTx();

      await logger.log(mockTx as never, {
        actorId: 'user-1',
        action: 'delete',
        resourceType: 'Comment',
        resourceId: 'cmt-1',
        diff: { before: { content: 'Hi' }, after: {} },
      });

      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: null,
          userAgent: null,
        }),
      });
    });
  });

  describe('getForResource', () => {
    it('should query audit trail for a resource', async () => {
      const mockClient = createMockClient();

      const results = await logger.getForResource(mockClient as never, 'Post', 'post-1', {
        take: 10,
        orderBy: 'desc',
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.actorId).toBe('user-1');
      expect(mockClient.auditLog.findMany).toHaveBeenCalledWith({
        where: { resourceType: 'Post', resourceId: 'post-1' },
        skip: undefined,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
