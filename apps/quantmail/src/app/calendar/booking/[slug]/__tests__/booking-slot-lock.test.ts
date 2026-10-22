// ============================================================================
// lockThenConfirmBooking (fix/qm-slot-lock-dead-surface-6)
//
// The public booking page must lock the slot pre-confirm: POST
// /api/calendar/booking/:slug/lock BEFORE POST .../book, carrying the lockId
// on the booking call. A failed lock never falls through to an unprotected
// /book — without the lock, two guests submitting the same slot at once can
// both pass the backend's pre-write availability check and double-book.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lockThenConfirmBooking, type SlotBookingPayload } from '../booking-utils';
import type { apiFetchRaw } from '@quant/api-client';

function makeFetch(): { raw: typeof apiFetchRaw; mock: ReturnType<typeof vi.fn> } {
  const mock = vi.fn();
  return { raw: mock as unknown as typeof apiFetchRaw, mock };
}

function okJson(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function failJson(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

const payload: SlotBookingPayload = {
  slot: '2026-11-02T14:00:00.000Z',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  notes: 'Intro call',
};

describe('lockThenConfirmBooking', () => {
  let raw: typeof apiFetchRaw;
  let mock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ raw, mock } = makeFetch());
  });

  it('locks the slot first, then books carrying the lockId', async () => {
    mock
      .mockResolvedValueOnce(okJson(200, { success: true, lockId: 'lock_abc', expiresAt: '2026-11-02T14:10:00Z' }))
      .mockResolvedValueOnce(okJson(201, { success: true, data: { icsContent: 'BEGIN:VCALENDAR' } }));

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toMatchObject({ ok: true, step: 'book', status: 201, lockId: 'lock_abc' });
    expect(result.bookBody).toEqual({ success: true, data: { icsContent: 'BEGIN:VCALENDAR' } });
    expect(mock).toHaveBeenCalledTimes(2);

    const [lockUrl, lockInit] = mock.mock.calls[0] as [string, RequestInit];
    expect(lockUrl).toBe('/api/calendar/booking/my-slug/lock');
    expect(lockInit.method).toBe('POST');
    // The lock identifies the slot and the booker — never the booker's name
    // or notes (the form details only matter at /book time).
    expect(JSON.parse(lockInit.body as string)).toEqual({ slot: payload.slot, email: payload.email });

    const [bookUrl, bookInit] = mock.mock.calls[1] as [string, RequestInit];
    expect(bookUrl).toBe('/api/calendar/booking/my-slug/book');
    expect(JSON.parse(bookInit.body as string)).toEqual({ ...payload, lockId: 'lock_abc' });
  });

  it('never calls /book when the lock is rejected with 409 (slot taken by another booker)', async () => {
    mock.mockResolvedValueOnce(
      failJson(409, {
        success: false,
        error: { message: 'Slot is currently locked by another booker', statusCode: 409 },
      }),
    );

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toMatchObject({
      ok: false,
      step: 'lock',
      status: 409,
      serverMessage: 'Slot is currently locked by another booker',
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a lock network failure — no unprotected /book', async () => {
    mock.mockRejectedValueOnce(new Error('network down'));

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toEqual({ ok: false, step: 'lock', status: 0 });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('still books when the lock body is unreadable (the lock is held server-side)', async () => {
    const unreadable: Response = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    } as Response;
    mock.mockResolvedValueOnce(unreadable).mockResolvedValueOnce(okJson(201, { success: true, data: {} }));

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result.ok).toBe(true);
    expect(result.lockId).toBeUndefined();
    const [, bookInit] = mock.mock.calls[1] as [string, RequestInit];
    // Old wire shape preserved: no lockId key when the lock response had none.
    expect(JSON.parse(bookInit.body as string)).toEqual(payload);
  });

  it('reports the book step honestly on a /book 409 after a successful lock', async () => {
    mock
      .mockResolvedValueOnce(okJson(200, { success: true, lockId: 'lock_abc' }))
      .mockResolvedValueOnce(
        failJson(409, {
          success: false,
          error: { message: 'Slot is no longer available', statusCode: 409 },
        }),
      );

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toMatchObject({
      ok: false,
      step: 'book',
      status: 409,
      serverMessage: 'Slot is no longer available',
      lockId: 'lock_abc',
    });
  });

  it('reports a /book network failure with status 0', async () => {
    mock
      .mockResolvedValueOnce(okJson(200, { success: true, lockId: 'lock_abc' }))
      .mockRejectedValueOnce(new Error('network down'));

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toEqual({ ok: false, step: 'book', status: 0, lockId: 'lock_abc' });
  });

  it('reads a string-shaped error body without throwing', async () => {
    mock.mockResolvedValueOnce(failJson(400, { success: false, error: 'bad slot' }));

    const result = await lockThenConfirmBooking(raw, 'my-slug', payload);

    expect(result).toMatchObject({ ok: false, step: 'lock', status: 400, serverMessage: 'bad slot' });
  });
});
