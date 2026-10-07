import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DisposableEmailService } from '../services/disposable-email.service';

describe('DisposableEmailService', () => {
  let service: DisposableEmailService;

  beforeEach(() => {
    service = new DisposableEmailService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createDisposable', () => {
    it('creates a disposable email with random address', () => {
      const result = service.createDisposable('user-1');

      expect(result.id).toBeDefined();
      expect(result.address).toMatch(/^[a-f0-9]{16}@quant\.email$/);
      expect(result.userId).toBe('user-1');
      expect(result.isActive).toBe(true);
      expect(result.expiresAt).toBeGreaterThan(result.createdAt);
    });

    it('defaults to 24h TTL', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const result = service.createDisposable('user-1');

      const expectedExpiry = new Date('2024-01-15T10:00:00Z').getTime() + 24 * 60 * 60 * 1000;
      expect(result.expiresAt).toBe(expectedExpiry);
    });

    it('accepts custom TTL', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const oneHour = 60 * 60 * 1000;
      const result = service.createDisposable('user-1', oneHour);

      const expectedExpiry = new Date('2024-01-15T10:00:00Z').getTime() + oneHour;
      expect(result.expiresAt).toBe(expectedExpiry);
    });

    it('generates unique addresses', () => {
      const first = service.createDisposable('user-1');
      const second = service.createDisposable('user-1');

      expect(first.address).not.toBe(second.address);
    });
  });

  describe('getDisposable', () => {
    it('returns disposable email by address', () => {
      const created = service.createDisposable('user-1');
      const result = service.getDisposable(created.address);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
    });

    it('returns null for non-existent address', () => {
      const result = service.getDisposable('nonexistent@quant.email');
      expect(result).toBeNull();
    });

    it('returns null for expired disposable', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const created = service.createDisposable('user-1');

      // Advance time past 24h
      vi.setSystemTime(new Date('2024-01-16T11:00:00Z'));
      const result = service.getDisposable(created.address);

      expect(result).toBeNull();
    });
  });

  describe('listActive', () => {
    it('returns only active disposables for user', () => {
      service.createDisposable('user-1');
      service.createDisposable('user-1');
      service.createDisposable('user-2');

      const result = service.listActive('user-1');
      expect(result).toHaveLength(2);
      expect(result.every((d) => d.userId === 'user-1')).toBe(true);
    });

    it('excludes expired disposables', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      service.createDisposable('user-1');

      vi.setSystemTime(new Date('2024-01-16T11:00:00Z'));
      service.createDisposable('user-1');

      const result = service.listActive('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('revokeDisposable', () => {
    it('revokes a disposable owned by user', () => {
      const created = service.createDisposable('user-1');
      const result = service.revokeDisposable(created.address, 'user-1');

      expect(result).toBe(true);
      expect(service.listActive('user-1')).toHaveLength(0);
    });

    it('returns false for non-existent address', () => {
      const result = service.revokeDisposable('nonexistent@quant.email', 'user-1');
      expect(result).toBe(false);
    });

    it('returns false when user does not own the disposable', () => {
      const created = service.createDisposable('user-1');
      const result = service.revokeDisposable(created.address, 'user-2');

      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes expired disposables', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      service.createDisposable('user-1');
      service.createDisposable('user-1');

      vi.setSystemTime(new Date('2024-01-16T11:00:00Z'));
      service.createDisposable('user-1');

      const removed = service.cleanup();
      expect(removed).toBe(2);
      expect(service.listActive('user-1')).toHaveLength(1);
    });

    it('returns 0 when nothing is expired', () => {
      service.createDisposable('user-1');
      const removed = service.cleanup();
      expect(removed).toBe(0);
    });
  });
});
