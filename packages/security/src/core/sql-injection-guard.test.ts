import { describe, it, expect, beforeEach } from 'vitest';
import { SQLInjectionGuard } from './sql-injection-guard';

describe('SQLInjectionGuard', () => {
  let guard: SQLInjectionGuard;

  beforeEach(() => {
    guard = new SQLInjectionGuard();
  });

  describe('analyze', () => {
    it('treats benign input as safe with full confidence', () => {
      const result = guard.analyze('john_doe');
      expect(result.isSafe).toBe(true);
      expect(result.threats).toEqual([]);
      expect(result.confidence).toBe(100);
    });

    it('treats empty/non-string input as safe', () => {
      expect(guard.analyze('').isSafe).toBe(true);
    });

    it('detects a classic tautology injection', () => {
      const result = guard.analyze("' OR '1'='1");
      expect(result.isSafe).toBe(false);
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(100);
    });

    it('detects UNION SELECT', () => {
      const result = guard.analyze('1 UNION SELECT password FROM users');
      expect(result.threats.some((t) => t.type === 'union_select')).toBe(true);
    });

    it('detects piggybacked DROP statements', () => {
      const result = guard.analyze("x'; DROP TABLE users");
      expect(result.isSafe).toBe(false);
    });

    it('flags blocked keywords in strict mode', () => {
      const result = guard.analyze('please EXEC something');
      expect(result.threats.some((t) => t.type === 'blocked_keyword')).toBe(true);
    });

    it('does not flag blocked keywords when strictMode is off', () => {
      const lax = new SQLInjectionGuard({ strictMode: false });
      const result = lax.analyze('the DROP of water');
      expect(result.threats.some((t) => t.type === 'blocked_keyword')).toBe(false);
    });

    it('rejects input exceeding maxQueryLength', () => {
      const small = new SQLInjectionGuard({ maxQueryLength: 5 });
      const result = small.analyze('abcdefghij');
      expect(result.isSafe).toBe(false);
      expect(result.threats[0]?.type).toBe('length_exceeded');
      expect(result.sanitized.length).toBe(5);
    });
  });

  describe('escapeIdentifier', () => {
    it('wraps a clean identifier in double quotes', () => {
      expect(guard.escapeIdentifier('user_name')).toBe('"user_name"');
    });

    it('throws on unsafe identifiers in strict mode', () => {
      expect(() => guard.escapeIdentifier('users; DROP')).toThrow(/Unsafe SQL identifier/);
    });

    it('strips unsafe chars without throwing when strictMode is off', () => {
      const lax = new SQLInjectionGuard({ strictMode: false });
      expect(lax.escapeIdentifier('a-b!c')).toBe('"abc"');
    });
  });

  describe('escapeValue', () => {
    it('doubles single quotes and escapes backslashes/newlines', () => {
      expect(guard.escapeValue("O'Brien")).toBe("O''Brien");
      expect(guard.escapeValue('a\\b')).toBe('a\\\\b');
      expect(guard.escapeValue('a\nb')).toBe('a\\nb');
    });

    it('stringifies non-string values', () => {
      expect(guard.escapeValue(42 as unknown as string)).toBe('42');
    });
  });

  describe('buildSelect', () => {
    it('builds a parameterized SELECT with WHERE/ORDER/LIMIT', () => {
      const q = guard.buildSelect('users', ['id', 'email'], { active: true }, 'created_at DESC', 10);
      expect(q.sql).toContain('SELECT "id", "email" FROM "users"');
      expect(q.sql).toContain('WHERE "active" = $1');
      expect(q.sql).toContain('ORDER BY "created_at" DESC');
      expect(q.sql).toContain('LIMIT $2');
      expect(q.params).toEqual([true, 10]);
      expect(q.safe).toBe(true);
    });

    it('uses IS NULL and IN for null / array conditions', () => {
      const q = guard.buildSelect('t', ['id'], { deleted: null, id: [1, 2, 3] });
      expect(q.sql).toContain('"deleted" IS NULL');
      expect(q.sql).toContain('"id" IN ($1, $2, $3)');
      expect(q.params).toEqual([1, 2, 3]);
    });
  });

  describe('buildInsert / buildParameterizedQuery', () => {
    it('builds a parameterized INSERT', () => {
      const q = guard.buildInsert('users', { name: 'Ann', age: 30 });
      expect(q.sql).toBe('INSERT INTO "users" ("name", "age") VALUES ($1, $2)');
      expect(q.params).toEqual(['Ann', 30]);
    });

    it('replaces named params with positional markers', () => {
      const q = guard.buildParameterizedQuery('SELECT * FROM t WHERE id = :id AND s = :s', {
        id: 7,
        s: 'x',
      });
      expect(q.sql).toBe('SELECT * FROM t WHERE id = $1 AND s = $2');
      expect(q.params).toEqual([7, 'x']);
      expect(q.hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('attempt log + whitelist', () => {
    it('logs attempts and can clear them', () => {
      guard.analyze("' OR 1=1");
      expect(guard.getAttemptLog().length).toBeGreaterThan(0);
      guard.clearAttemptLog();
      expect(guard.getAttemptLog()).toEqual([]);
    });

    it('does not log when logAttempts is disabled', () => {
      const quiet = new SQLInjectionGuard({ logAttempts: false });
      quiet.analyze("' OR 1=1");
      expect(quiet.getAttemptLog()).toEqual([]);
    });

    it('registers prepared statements and whitelist entries without error', () => {
      expect(() => {
        guard.registerPreparedStatement('byId', 'SELECT * FROM t WHERE id = :id');
        guard.addToWhitelist('deadbeef');
      }).not.toThrow();
    });
  });
});
