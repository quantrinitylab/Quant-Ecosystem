import { describe, expect, it } from 'vitest';
import { CIRCULAR, REDACTED, Redactor, redactSecrets, toLoggableJson } from '../src/index';

describe('Redactor', () => {
  it('redacts secrets under sensitive key names at any depth', () => {
    const payload = {
      sessionId: 's-1',
      auth: {
        password: 'hunter2',
        nested: { apiKey: 'sk-live-abc123', attempts: 3 },
      },
      list: [{ accessToken: 'tok-xyz' }, { name: 'plain' }],
    };
    const redacted = redactSecrets(payload);
    expect(redacted.auth.password).toBe(REDACTED);
    expect(redacted.auth.nested.apiKey).toBe(REDACTED);
    expect(redacted.auth.nested.attempts).toBe(3);
    expect(redacted.list[0]?.accessToken).toBe(REDACTED);
    expect(redacted.list[1]?.name).toBe('plain');
    expect(redacted.sessionId).toBe('s-1');
  });

  it('never leaks the raw secret into serialized output', () => {
    const secret = 'super-secret-token-value-9f8e7d6c5b';
    const payload = {
      request: { headers: { authorization: `Bearer ${secret}` }, body: { userToken: secret } },
      traceId: 'trace-123',
    };
    const json = toLoggableJson(payload);
    expect(json).not.toContain(secret);
    expect(json).toContain('trace-123');
    expect(json).toContain(REDACTED);
  });

  it('masks email addresses but keeps the domain', () => {
    const redacted = redactSecrets({ contact: 'sahenoor@example.com', cc: ['a@x.io'] });
    expect(redacted.contact).toBe('***@example.com');
    expect(redacted.cc[0]).toBe('***@x.io');
  });

  it('email masking matches the pre-ReDoS-fix regex semantics exactly', () => {
    const masked = [
      'user.name+tag@sub.example.co.in',
      'a@b.co',
      'a@b..c', // dot may be adjacent, just not first/last in domain
      'u@v.w.xy',
    ];
    const notMasked = [
      '@example.com', // empty local part
      'a@', // empty domain
      'a@example', // no dot in domain
      'a@.com', // dot first in domain
      'a@com.', // dot last in domain
      'a@@b.c', // two @
      'a b@c.d', // whitespace in local part
      'a@b c.d', // whitespace in domain
      'plain', // no @ at all
      '',
      'a@b.c ', // trailing whitespace
    ];
    for (const email of masked) {
      const out = redactSecrets({ v: email }).v as string;
      expect(out, email).toBe('***' + email.slice(email.indexOf('@')));
    }
    for (const s of notMasked) {
      expect(redactSecrets({ v: s }).v, s).toBe(s);
    }
  });

  it('email detection is linear-time (no ReDoS on dot-heavy input)', () => {
    const evil = 'u@' + 'a.'.repeat(15000) + 'x '; // non-matching: trailing space
    const start = Date.now();
    const out = redactSecrets({ v: evil }).v as string;
    expect(out).toBe(evil); // unchanged, since it is not an email
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('redacts credential-scheme strings and sensitive URL parts', () => {
    expect(redactSecrets({ h: 'Bearer abc.def.ghi' }).h).toBe(REDACTED);
    expect(redactSecrets({ h: 'Basic dXNlcjpwYXNz' }).h).toBe(REDACTED);
    const url = redactSecrets({
      callback: 'https://hooks.example.com/cb?api_key=SECRET123&mode=live',
      plain: 'https://example.com/about?mode=live',
    });
    expect(url.callback).toContain('api_key=' + encodeURIComponent(REDACTED));
    expect(url.callback).not.toContain('SECRET123');
    expect(url.plain).toBe('https://example.com/about?mode=live');
  });

  it('does not mutate the input and survives circular references', () => {
    const inner = { password: 'p@ss' };
    const payload: Record<string, unknown> = { inner };
    payload['self'] = payload;
    const redacted = redactSecrets(payload) as Record<string, unknown>;
    expect((redacted['inner'] as Record<string, unknown>)['password']).toBe(REDACTED);
    expect(redacted['self']).toBe(CIRCULAR);
    expect(inner.password).toBe('p@ss');
    expect(toLoggableJson(payload)).not.toContain('p@ss');
  });

  it('keeps non-secret values intact, including trace identifiers', () => {
    const payload = {
      traceId: 't-1',
      spanId: 'sp-2',
      durationMs: 42,
      ok: true,
      nothing: null,
      at: new Date('2026-10-10T00:00:00.000Z'),
    };
    const redacted = redactSecrets(payload);
    expect(redacted).toEqual({ ...payload, at: '2026-10-10T00:00:00.000Z' });
  });

  it('supports caller-defined sensitive keys', () => {
    const redactor = new Redactor({ extraSensitiveKeys: ['internal_ref', /legacy/i] });
    const redacted = redactor.redact({ internal_ref: 'abc', legacyCode: 'def', name: 'keep' });
    expect(redacted.internal_ref).toBe(REDACTED);
    expect(redacted.legacyCode).toBe(REDACTED);
    expect(redacted.name).toBe('keep');
  });
});
