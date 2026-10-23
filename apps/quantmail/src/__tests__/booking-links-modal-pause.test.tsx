// ============================================================================
// fix/qm-booking-link-host-controls: host pause/resume client helper.
//
// The BookingLinksModal's host toggle talks to PATCH /api/booking/links/:id
// through the same-origin Next proxy. These tests pin the request shape
// (method + JSON body + id encoding) and the honest boolean contract: false
// on any failure, never a throw and never a swallowed lie.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the api-client so these tests run without the backend.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { updateBookingLinkOnServer } from '../app/calendar/components/BookingLinksModal';

describe('updateBookingLinkOnServer (host pause/resume)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  it('issues PATCH /api/booking/links/:id with a JSON { isActive } body', async () => {
    vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);

    const ok = await updateBookingLinkOnServer('clx-booking-server-1', { isActive: false });

    expect(apiFetchRaw).toHaveBeenCalledWith(
      '/api/booking/links/clx-booking-server-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const [, init] = vi.mocked(apiFetchRaw).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ isActive: false });
    expect(ok).toBe(true);
  });

  it('sends isActive true when resuming', async () => {
    vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);

    await updateBookingLinkOnServer('clx-booking-server-1', { isActive: true });

    const [, init] = vi.mocked(apiFetchRaw).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ isActive: true });
  });

  it('URL-encodes link ids', async () => {
    vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);

    await updateBookingLinkOnServer('link with spaces/1', { isActive: false });

    expect(vi.mocked(apiFetchRaw).mock.calls[0][0]).toBe(
      '/api/booking/links/link%20with%20spaces%2F1',
    );
  });

  it('returns false on a non-2xx response (failed toggle keeps old state)', async () => {
    vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 404 } as Response);

    const ok = await updateBookingLinkOnServer('missing-id', { isActive: false });

    expect(ok).toBe(false);
  });

  it('returns false on a network failure (never throws into the handler)', async () => {
    vi.mocked(apiFetchRaw).mockRejectedValue(new Error('offline'));

    const ok = await updateBookingLinkOnServer('clx-booking-server-1', { isActive: false });

    expect(ok).toBe(false);
  });
});
