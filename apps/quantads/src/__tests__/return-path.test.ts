import { describe, it, expect } from 'vitest';
import { loginHref, safeReturnPath } from '../lib/return-path';

describe('safeReturnPath', () => {
  it('accepts a same-origin absolute path, query and hash included', () => {
    expect(safeReturnPath('/campaigns')).toBe('/campaigns');
    expect(safeReturnPath('/campaigns?status=active#top')).toBe('/campaigns?status=active#top');
  });

  it('rejects anything that could leave this origin', () => {
    for (const hostile of [
      'https://evil.tld',
      '//evil.tld',
      '/\\evil.tld',
      'javascript:alert(1)',
      'campaigns',
      '/campaigns\nLocation: https://evil.tld',
    ]) {
      expect(safeReturnPath(hostile)).toBeNull();
    }
  });

  it('rejects empty and missing values', () => {
    expect(safeReturnPath('')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });

  it('refuses to return to the sign-in routes, which would loop', () => {
    expect(safeReturnPath('/login')).toBeNull();
    expect(safeReturnPath('/login?returnTo=/campaigns')).toBeNull();
    expect(safeReturnPath('/auth/login')).toBeNull();
  });
});

describe('loginHref', () => {
  it('carries a safe path through as an encoded returnTo', () => {
    expect(loginHref('/campaigns?status=active')).toBe(
      '/login?returnTo=%2Fcampaigns%3Fstatus%3Dactive',
    );
  });

  it('drops an unsafe path instead of forwarding it', () => {
    expect(loginHref('//evil.tld')).toBe('/login');
    expect(loginHref(null)).toBe('/login');
  });
});
