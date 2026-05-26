import { describe, it, expect } from 'vitest';
import { WebFingerHandler, WebFingerResponseSchema } from './webfinger.js';

describe('WebFingerHandler', () => {
  it('valid acct query returns correct JRD with subject and self link', () => {
    const handler = new WebFingerHandler();
    const result = handler.handle('acct:alice@example.com', 'example.com');

    expect(result).toBeDefined();
    expect(result!.subject).toBe('acct:alice@example.com');
    expect(result!.links).toHaveLength(1);
    expect(result!.links[0]!.rel).toBe('self');
    expect(result!.links[0]!.type).toBe('application/activity+json');
    expect(result!.links[0]!.href).toBe('https://example.com/users/alice');
  });

  it('invalid resource format throws', () => {
    const handler = new WebFingerHandler();
    expect(() => handler.handle('invalid-format', 'example.com')).toThrow(
      'Invalid resource format',
    );
  });

  it('response matches schema', () => {
    const handler = new WebFingerHandler();
    const result = handler.handle('acct:bob@social.test', 'social.test');
    const parsed = WebFingerResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('returns undefined for nonexistent user when actorExists is provided', () => {
    const handler = new WebFingerHandler((username) => username === 'alice');

    const existing = handler.handle('acct:alice@example.com', 'example.com');
    expect(existing).toBeDefined();
    expect(existing!.subject).toBe('acct:alice@example.com');

    const nonexistent = handler.handle('acct:nobody@example.com', 'example.com');
    expect(nonexistent).toBeUndefined();
  });

  it('without actorExists callback, returns result for any user', () => {
    const handler = new WebFingerHandler();

    const result = handler.handle('acct:anyone@example.com', 'example.com');
    expect(result).toBeDefined();
    expect(result!.subject).toBe('acct:anyone@example.com');
  });
});
