/**
 * New-device sign-in security alerts — pure detection + email copy contract.
 *
 * Regression (findings queue, 2026-10-12): browser logins issued sessions
 * silently, with no new-device detection and no alert email. The contract
 * pinned here:
 * - A device is its normalized User-Agent (case/whitespace-insensitive).
 * - The known set is the user's LIVE browser families only: revoked,
 *   expired, OAuth-grant, and other users' rows never count as "known".
 * - A first-ever sign-in (no prior families) does NOT alert — registration
 *   already proved the address.
 * - A sign-in with no User-Agent alerts whenever priors exist (fail safe).
 * - Email copy carries the real device, IP and time, never invented values,
 *   and HTML-escapes attacker-controlled strings (a User-Agent is
 *   client-controlled input rendered into an inbox).
 *
 * This file imports the REAL module: it has no top-level runtime imports
 * (the SES sender is loaded lazily inside sendNewDeviceAlert only), so no
 * mocks are needed here.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { describe, expect, it } from 'vitest';
import {
  isNewDeviceSignIn,
  newDeviceAlertHtml,
  newDeviceAlertText,
  normalizeDeviceFingerprint,
} from '../lib/new-device-alert';

interface FakeRow {
  userId: string;
  userAgent: string | null;
  isRevoked: boolean;
  expiresAt: Date;
  source: string | null;
}

const NOW = new Date('2026-10-26T06:00:00.000Z');

const fakeStore = (rows: FakeRow[]) => ({
  refreshToken: {
    findMany: async ({ where }: any) => {
      // Mirror the query the detector issues: the user's full session
      // history. The detector applies the liveness/source filter itself,
      // so the fake must NOT pre-filter revoked/expired/OAuth rows away —
      // those distinctions are exactly what is under test.
      const kept = rows.filter((row) => {
        if (where?.userId !== undefined && row.userId !== where.userId) return false;
        return true;
      });
      return kept.map((row) => ({
        userAgent: row.userAgent,
        isRevoked: row.isRevoked,
        expiresAt: row.expiresAt,
        source: row.source,
      }));
    },
  },
});

const liveRow = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  userId: 'user-1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0',
  isRevoked: false,
  expiresAt: new Date('2026-11-25T06:00:00.000Z'),
  source: 'browser',
  ...overrides,
});

describe('normalizeDeviceFingerprint', () => {
  it('lowercases and collapses whitespace', () => {
    expect(
      normalizeDeviceFingerprint('Mozilla/5.0  (Windows   NT 10.0) Chrome/140.0'),
    ).toBe('mozilla/5.0 (windows nt 10.0) chrome/140.0');
  });

  it('returns null for empty, blank, null and undefined', () => {
    expect(normalizeDeviceFingerprint('')).toBeNull();
    expect(normalizeDeviceFingerprint('   ')).toBeNull();
    expect(normalizeDeviceFingerprint(null)).toBeNull();
    expect(normalizeDeviceFingerprint(undefined)).toBeNull();
  });
});

describe('isNewDeviceSignIn', () => {
  it('first-ever sign-in does not alert', async () => {
    const store = fakeStore([]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: 'Anything/1.0' }, NOW),
    ).resolves.toBe(false);
  });

  it('same device does not alert, even with case/whitespace jitter', async () => {
    const store = fakeStore([liveRow()]);
    await expect(
      isNewDeviceSignIn(
        store,
        'user-1',
        { userAgent: 'mozilla/5.0   (Windows NT 10.0; Win64; x64) chrome/140.0' },
        NOW,
      ),
    ).resolves.toBe(false);
  });

  it('a legacy untagged family with the same UA counts as known', async () => {
    const store = fakeStore([liveRow({ source: null })]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: liveRow().userAgent }, NOW),
    ).resolves.toBe(false);
  });

  it('a different UA alerts', async () => {
    const store = fakeStore([liveRow()]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: 'Mozilla/5.0 (iPhone) Safari/18.0' }, NOW),
    ).resolves.toBe(true);
  });

  it('no User-Agent alerts whenever priors exist', async () => {
    const store = fakeStore([liveRow()]);
    await expect(isNewDeviceSignIn(store, 'user-1', {}, NOW)).resolves.toBe(true);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: null }, NOW),
    ).resolves.toBe(true);
  });

  it('only a revoked family with this UA still alerts', async () => {
    const store = fakeStore([liveRow({ isRevoked: true })]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: liveRow().userAgent }, NOW),
    ).resolves.toBe(true);
  });

  it('only an expired family with this UA still alerts', async () => {
    const store = fakeStore([
      liveRow({ expiresAt: new Date('2026-10-25T06:00:00.000Z') }),
    ]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: liveRow().userAgent }, NOW),
    ).resolves.toBe(true);
  });

  it('only an OAuth-grant row with this UA still alerts: a grant is history, not a known browser device', async () => {
    const store = fakeStore([liveRow({ source: 'oauth' })]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: liveRow().userAgent }, NOW),
    ).resolves.toBe(true);
  });

  it("another user's families are invisible: they neither prove history nor knowledge", async () => {
    // No rows of our own at all: a first sign-in, even though user-2 has history.
    const store = fakeStore([liveRow({ userId: 'user-2' })]);
    await expect(
      isNewDeviceSignIn(store, 'user-1', { userAgent: liveRow().userAgent }, NOW),
    ).resolves.toBe(false);
    // Our own live device plus user-2's device: user-2's UA is still new for us.
    const mixed = fakeStore([
      liveRow(),
      liveRow({ userId: 'user-2', userAgent: 'Other/2.0' }),
    ]);
    await expect(
      isNewDeviceSignIn(mixed, 'user-1', { userAgent: 'Other/2.0' }, NOW),
    ).resolves.toBe(true);
  });
});

describe('new-device alert email copy', () => {
  const details = {
    name: 'Alice',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0',
    ipAddress: '203.0.113.7',
    signedInAt: new Date('2026-10-26T06:00:00.000Z'),
  };

  it('text body carries the real device, IP and time plus remediation', () => {
    const text = newDeviceAlertText(details);
    expect(text).toContain('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0');
    expect(text).toContain('203.0.113.7');
    expect(text).toContain('2026-10-26T06:00:00.000Z');
    expect(text).toContain('change your QuantMail password');
    expect(text).toContain('Active Sessions');
  });

  it('missing device/IP degrade to honest fallbacks, never invented values', () => {
    const text = newDeviceAlertText({ signedInAt: details.signedInAt });
    expect(text).toContain('an unrecognised device');
    expect(text).toContain('unknown location');
    expect(text).not.toContain('203.0.113.7');
  });

  it('HTML body escapes client-controlled strings', () => {
    const html = newDeviceAlertHtml({
      ...details,
      name: '<img src=x onerror=alert(1)>',
      userAgent: 'Evil"><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
  });
});
