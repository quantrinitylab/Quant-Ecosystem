// ============================================================================
// Booking slot-lock client helpers (fix/qm-calendar-slot-lock).
//
// The public booking page is the lock endpoint's only consumer: it must hold
// the slot (lock on step 2 once the guest's email is valid, reuse the lock
// at submit, release it on back/book-another) instead of racing straight to
// /book. These tests pin the client side of that handshake — request shape,
// lockId extraction (top-level and nested `data` envelope), failure mapping,
// idempotent best-effort release — without the full workspace install.
//
// Pure-function tests (no @testing-library/react — CI runs pnpm install
// --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  requestSlotLock,
  releaseSlotLock,
  isSameSlotLock,
  normalizeBookerEmail,
  type SlotLock,
  type SlotLockFetch,
} from '../booking-utils';

type Call = { url: string; init: Parameters<SlotLockFetch>[1] };

function stubFetch(response: { ok: boolean; status: number; json: unknown }): {
  fetch: SlotLockFetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetch: SlotLockFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
    };
  };
  return { fetch, calls };
}

function throwingFetch(): SlotLockFetch {
  return async () => {
    throw new Error('network down');
  };
}

describe('normalizeBookerEmail', () => {
  it('trims and lowercases, matching the backend normalization', () => {
    expect(normalizeBookerEmail('  Alice@Example.IO  ')).toBe('alice@example.io');
  });
});

describe('isSameSlotLock', () => {
  const lock: SlotLock = {
    lockId: 'lock_1',
    email: 'alice@example.io',
    slotIso: '2026-10-27T09:00:00.000Z',
  };

  it('matches the same slot and email (case/whitespace-insensitive email)', () => {
    expect(isSameSlotLock(lock, '2026-10-27T09:00:00.000Z', 'alice@example.io')).toBe(true);
    expect(isSameSlotLock(lock, '2026-10-27T09:00:00.000Z', '  ALICE@Example.IO ')).toBe(true);
  });

  it('rejects a different slot, a different email, or no lock', () => {
    expect(isSameSlotLock(lock, '2026-10-27T09:30:00.000Z', 'alice@example.io')).toBe(false);
    expect(isSameSlotLock(lock, '2026-10-27T09:00:00.000Z', 'bob@example.io')).toBe(false);
    expect(isSameSlotLock(null, '2026-10-27T09:00:00.000Z', 'alice@example.io')).toBe(false);
  });
});

describe('requestSlotLock', () => {
  it('posts the slot and email to the public lock endpoint', async () => {
    const { fetch, calls } = stubFetch({
      ok: true,
      status: 200,
      json: { success: true, lockId: 'lock_abc', expiresAt: '2026-10-27T09:10:00.000Z' },
    });
    const result = await requestSlotLock(fetch, 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io');
    expect(result).toEqual({ lockId: 'lock_abc', expiresAt: '2026-10-27T09:10:00.000Z' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/calendar/booking/strategy-session/lock');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0]!.init.body)).toEqual({
      slot: '2026-10-27T09:00:00.000Z',
      email: 'alice@example.io',
    });
  });

  it('also accepts the lockId nested under the data envelope', async () => {
    const { fetch } = stubFetch({
      ok: true,
      status: 200,
      json: { success: true, data: { lockId: 'lock_nested', expiresAt: '2026-10-27T09:10:00.000Z' } },
    });
    const result = await requestSlotLock(fetch, 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io');
    expect(result.lockId).toBe('lock_nested');
  });

  it('throws the status and server message when another booker holds the slot', async () => {
    const { fetch } = stubFetch({
      ok: false,
      status: 409,
      json: { error: { message: 'Slot is currently locked by another booker' } },
    });
    await expect(
      requestSlotLock(fetch, 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Slot is currently locked by another booker',
    });
  });

  it('passes a dead-link status through so the caller can flip to the dead-link panel', async () => {
    const { fetch } = stubFetch({
      ok: false,
      status: 410,
      json: { error: { message: 'Booking link is inactive' } },
    });
    await expect(
      requestSlotLock(fetch, 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io'),
    ).rejects.toMatchObject({ status: 410, message: 'Booking link is inactive' });
  });

  it('throws status 0 when the fetch itself throws (network failure)', async () => {
    await expect(
      requestSlotLock(throwingFetch(), 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('fails loudly on a 2xx without a lockId instead of booking lock-less', async () => {
    const { fetch } = stubFetch({ ok: true, status: 200, json: { success: true } });
    await expect(
      requestSlotLock(fetch, 'strategy-session', '2026-10-27T09:00:00.000Z', 'alice@example.io'),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('releaseSlotLock', () => {
  it('posts the lockId to the unlock endpoint', async () => {
    const { fetch, calls } = stubFetch({ ok: true, status: 200, json: { success: true } });
    await releaseSlotLock(fetch, 'strategy-session', 'lock_abc');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/calendar/booking/strategy-session/unlock');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ lockId: 'lock_abc' });
  });

  it('never throws: a failed or unreachable release must not surface as a booking error', async () => {
    const failed = stubFetch({ ok: false, status: 500, json: {} });
    await expect(releaseSlotLock(failed.fetch, 'strategy-session', 'lock_abc')).resolves.toBeUndefined();
    await expect(releaseSlotLock(throwingFetch(), 'strategy-session', 'lock_abc')).resolves.toBeUndefined();
  });
});
