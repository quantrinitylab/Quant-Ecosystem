// ============================================================================
// QuantAI — Cookie header parsing tests (F-206)
// ============================================================================
//
// The auth /refresh NO_SESSION fast-path must match the refresh cookie by its
// EXACT name. These tests pin the bypass cases a substring match would miss:
// any cookie whose name merely *contains* the target string must not count.

import { describe, it, expect } from 'vitest';
import { parseCookieHeader, hasCookie } from '../lib/cookies';

const REFRESH = 'quantmail_refresh';

describe('hasCookie — exact-name matching', () => {
  it('matches the exact cookie name', () => {
    expect(hasCookie('quantmail_refresh=abc123', REFRESH)).toBe(true);
  });

  it('matches among multiple cookies', () => {
    expect(hasCookie('theme=dark; quantmail_refresh=abc123; lang=en', REFRESH)).toBe(true);
  });

  it('rejects a cookie whose name merely contains the target (prefix attack)', () => {
    expect(hasCookie('xquantmail_refresh=abc123', REFRESH)).toBe(false);
  });

  it('rejects a cookie whose name has the target as a prefix', () => {
    expect(hasCookie('quantmail_refresh2=abc123', REFRESH)).toBe(false);
  });

  it('rejects a cookie whose name has the target as a suffix', () => {
    expect(hasCookie('my_quantmail_refresh=abc123', REFRESH)).toBe(false);
  });

  it('rejects the target mixed with a decoy among other cookies', () => {
    expect(hasCookie('a=1; xquantmail_refresh=evil; b=2', REFRESH)).toBe(false);
  });

  it('is case-sensitive on the name', () => {
    expect(hasCookie('Quantmail_Refresh=abc123', REFRESH)).toBe(false);
  });

  it('tolerates whitespace around the pair', () => {
    expect(hasCookie('  quantmail_refresh = abc123  ', REFRESH)).toBe(true);
  });

  it('returns false for an empty header', () => {
    expect(hasCookie('', REFRESH)).toBe(false);
  });

  it('returns false for null / undefined headers', () => {
    expect(hasCookie(null, REFRESH)).toBe(false);
    expect(hasCookie(undefined, REFRESH)).toBe(false);
  });

  it('returns false for a header of only separators', () => {
    expect(hasCookie(';;;', REFRESH)).toBe(false);
  });

  it('returns false for an empty cookie name', () => {
    expect(hasCookie('', '')).toBe(false);
  });
});

describe('parseCookieHeader — pair parsing', () => {
  it('parses name/value pairs', () => {
    const cookies = parseCookieHeader('a=1; b=2');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('b')).toBe('2');
  });

  it('keeps everything after the first = in the value', () => {
    const cookies = parseCookieHeader('quantmail_refresh=abc==def');
    expect(cookies.get(REFRESH)).toBe('abc==def');
  });

  it('treats a pair without = as a flag with an empty value', () => {
    const cookies = parseCookieHeader(`flag; ${REFRESH}=abc`);
    expect(cookies.get('flag')).toBe('');
    expect(cookies.get(REFRESH)).toBe('abc');
  });

  it('ignores empty pairs and whitespace-only pairs', () => {
    const cookies = parseCookieHeader(`a=1;;  ;${REFRESH}=abc`);
    expect(cookies.size).toBe(2);
  });

  it('keeps the first occurrence on duplicate names', () => {
    const cookies = parseCookieHeader(`${REFRESH}=first; ${REFRESH}=second`);
    expect(cookies.get(REFRESH)).toBe('first');
  });

  it('returns an empty map for an empty header', () => {
    expect(parseCookieHeader('').size).toBe(0);
  });
});
