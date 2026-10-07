// ============================================================================
// Event Schema Registry - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { EventSchemaRegistry } from '../event-schema-registry';

describe('EventSchemaRegistry', () => {
  let registry: EventSchemaRegistry;

  beforeEach(() => {
    registry = new EventSchemaRegistry();
  });

  describe('validate', () => {
    it('should validate a valid message:new event', () => {
      const result = registry.validate('message:new', {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello!',
        type: 'text',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          messageId: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello!',
          type: 'text',
        });
      }
    });

    it('should validate a valid presence:update event', () => {
      const result = registry.validate('presence:update', {
        userId: 'user-1',
        status: 'online',
      });

      expect(result.success).toBe(true);
    });

    it('should reject a malformed message:new event (missing required field)', () => {
      const result = registry.validate('message:new', {
        messageId: 'msg-1',
        // missing conversationId, senderId, content, type
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should reject presence:update with invalid status', () => {
      const result = registry.validate('presence:update', {
        userId: 'user-1',
        status: 'invalid_status',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for unregistered event type', () => {
      const result = registry.validate('unknown:event', { foo: 'bar' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No schema registered');
      }
    });

    it('should validate cross-app document:updated event', () => {
      const result = registry.validate('document:updated', {
        documentId: 'doc-1',
        userId: 'user-1',
        title: 'My Document',
        changeType: 'edited',
        updatedAt: Date.now(),
      });

      expect(result.success).toBe(true);
    });

    it('should validate cross-app file:shared event', () => {
      const result = registry.validate('file:shared', {
        fileId: 'file-1',
        fileName: 'report.pdf',
        sharedBy: 'user-1',
        sharedWith: ['user-2', 'user-3'],
        permissions: 'view',
      });

      expect(result.success).toBe(true);
    });

    it('should validate cross-app payment:received event', () => {
      const result = registry.validate('payment:received', {
        paymentId: 'pay-1',
        amount: 50.0,
        currency: 'USD',
        fromUserId: 'user-1',
        toUserId: 'user-2',
      });

      expect(result.success).toBe(true);
    });

    it('should validate cross-app search:invalidate event', () => {
      const result = registry.validate('search:invalidate', {
        indexName: 'posts',
        documentIds: ['doc-1', 'doc-2'],
        reason: 'updated',
      });

      expect(result.success).toBe(true);
    });

    it('should validate cross-app calendar:reminder event', () => {
      const result = registry.validate('calendar:reminder', {
        eventId: 'evt-1',
        title: 'Team Meeting',
        startTime: Date.now() + 900000,
        reminderMinutes: 15,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('register', () => {
    it('should register a custom schema', () => {
      const customSchema = z.object({
        customField: z.string(),
        value: z.number(),
      });

      registry.register('custom:event', customSchema);

      const result = registry.validate('custom:event', {
        customField: 'test',
        value: 42,
      });

      expect(result.success).toBe(true);
    });

    it('should override an existing schema', () => {
      const newSchema = z.object({
        newField: z.string(),
      });

      registry.register('message:new', newSchema);

      const result = registry.validate('message:new', { newField: 'hello' });
      expect(result.success).toBe(true);
    });
  });

  describe('getSchema', () => {
    it('should return schema for registered type', () => {
      const schema = registry.getSchema('message:new');
      expect(schema).toBeDefined();
    });

    it('should return undefined for unregistered type', () => {
      const schema = registry.getSchema('nonexistent:type');
      expect(schema).toBeUndefined();
    });
  });

  describe('listTypes', () => {
    it('should list all registered event types', () => {
      const types = registry.listTypes();

      expect(types).toContain('message:new');
      expect(types).toContain('message:typing');
      expect(types).toContain('message:read');
      expect(types).toContain('message:deleted');
      expect(types).toContain('presence:update');
      expect(types).toContain('post:new');
      expect(types).toContain('post:interaction');
      expect(types).toContain('call:signal');
      expect(types).toContain('call:incoming');
      expect(types).toContain('stream:event');
      expect(types).toContain('notification:new');
      expect(types).toContain('ai:chunk');
      expect(types).toContain('ai:device');
      expect(types).toContain('document:updated');
      expect(types).toContain('file:shared');
      expect(types).toContain('calendar:reminder');
      expect(types).toContain('payment:received');
      expect(types).toContain('search:invalidate');
    });

    it('should have 18 default types', () => {
      const types = registry.listTypes();
      expect(types.length).toBe(18);
    });
  });
});
