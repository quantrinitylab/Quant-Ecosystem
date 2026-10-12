import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The modal talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend and so the read/write
// outcomes are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import {
  BookingLinksModal,
  fetchBookingLinksFromServer,
  deleteBookingLinkOnServer,
  mergeServerAndLocalLinks,
  isLocalOnlyBookingLink,
  mapServerBookingLink,
  type BookingLinkItem,
} from '../app/calendar/components/BookingLinksModal';

const serverRecord = {
  id: 'clx-booking-server-1',
  userId: 'user-1',
  slug: 'strategy-session',
  title: 'Strategy Session',
  hostTitle: 'Strategy Session',
  description: 'Pick a time',
  duration: 30,
  availableDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  isActive: true,
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
  hostName: null,
  hostEmail: null,
};

const envelope = { success: true, data: [serverRecord] };

describe('BookingLinksModal read/write split-brain fix (fix/qm-bookinglinks-read-write)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  // ---------------------------------------------------------------------------
  // 1. READ: open -> GET /api/booking/links -> links render from the backend
  // ---------------------------------------------------------------------------
  describe('fetchBookingLinksFromServer (GET read)', () => {
    it('issues GET /api/booking/links and maps the backend envelope to link items', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: true,
        json: async () => envelope,
      } as Response);

      const links = await fetchBookingLinksFromServer();

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/booking/links',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(links).toEqual([
        {
          id: 'clx-booking-server-1',
          slug: 'strategy-session',
          title: 'Strategy Session',
          description: 'Pick a time',
          duration: 30,
          startHour: 9,
          endHour: 17,
          availableDays: [1, 2, 3, 4, 5],
          isActive: true,
          createdAt: '2026-10-11T10:00:00.000Z',
        },
      ]);
    });

    it('returns null on non-2xx so the modal keeps the honest local fallback', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 401 } as Response);
      await expect(fetchBookingLinksFromServer()).resolves.toBeNull();
    });

    it('returns null on network failure instead of throwing', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new Error('backend down'));
      await expect(fetchBookingLinksFromServer()).resolves.toBeNull();
    });

    it('returns null on a malformed envelope instead of rendering fake rows', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, data: [] }),
      } as Response);
      await expect(fetchBookingLinksFromServer()).resolves.toBeNull();

      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: 'not-an-array' }),
      } as Response);
      await expect(fetchBookingLinksFromServer()).resolves.toBeNull();
    });

    it('skips malformed records in the payload rather than crashing the list', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ nope: true }, serverRecord, null],
        }),
      } as Response);
      const links = await fetchBookingLinksFromServer();
      expect(links).toHaveLength(1);
      expect(links?.[0]?.id).toBe('clx-booking-server-1');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. WRITE: delete -> DELETE /api/booking/links/:id -> row removed
  // ---------------------------------------------------------------------------
  describe('deleteBookingLinkOnServer (DELETE write)', () => {
    it('issues DELETE to the id-addressed backend path and reports true on 2xx', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);

      await expect(deleteBookingLinkOnServer('clx-booking-server-1')).resolves.toBe(true);
      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/booking/links/clx-booking-server-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('URI-encodes the id before calling the backend', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);
      await deleteBookingLinkOnServer('weird/id 1');
      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/booking/links/weird%2Fid%201',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns false on non-2xx or network failure so the row is kept honestly', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 404 } as Response);
      await expect(deleteBookingLinkOnServer('gone')).resolves.toBe(false);

      vi.mocked(apiFetchRaw).mockRejectedValue(new Error('offline'));
      await expect(deleteBookingLinkOnServer('x')).resolves.toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MERGE: server is the source of truth; local-only links survive, never
  //    duplicated; backend-created links always appear.
  // ---------------------------------------------------------------------------
  describe('mergeServerAndLocalLinks', () => {
    const localOnly: BookingLinkItem = {
      id: 'link-1729000000000-abc12',
      slug: 'local-only-sync',
      title: 'Local Only Sync',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3],
      isActive: true,
      createdAt: '2026-10-11T00:00:00.000Z',
    };

    it('places server links first and appends local-only links marked pendingSync', () => {
      const merged = mergeServerAndLocalLinks(
        [mapServerBookingLink(serverRecord)!],
        [localOnly],
      );
      expect(merged).toHaveLength(2);
      expect(merged[0].id).toBe('clx-booking-server-1');
      expect(merged[0].pendingSync).toBeUndefined();
      expect(merged[1].slug).toBe('local-only-sync');
      expect(merged[1].pendingSync).toBe(true);
    });

    it('dedupes a local link whose slug already exists on the server (it synced)', () => {
      const alreadySyncedLocal: BookingLinkItem = {
        ...localOnly,
        slug: 'strategy-session', // the server GET has this slug
      };
      const merged = mergeServerAndLocalLinks(
        [mapServerBookingLink(serverRecord)!],
        [alreadySyncedLocal],
      );
      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('clx-booking-server-1');
    });

    it('keeps a backend-created link that exists only on the server', () => {
      // A link made on another device: absent locally, present on the server.
      const merged = mergeServerAndLocalLinks([mapServerBookingLink(serverRecord)!], []);
      expect(merged).toHaveLength(1);
      expect(merged[0].slug).toBe('strategy-session');
    });
  });

  describe('isLocalOnlyBookingLink', () => {
    it('flags the explicit pendingSync marker and legacy local ids', () => {
      expect(
        isLocalOnlyBookingLink({ id: 'link-123', slug: 'a', title: 'a', duration: 30, startHour: 9, endHour: 17, availableDays: [], isActive: true, createdAt: '', pendingSync: true }),
      ).toBe(true);
      expect(
        isLocalOnlyBookingLink({ id: 'link-1729000000000-abc12', slug: 'a', title: 'a', duration: 30, startHour: 9, endHour: 17, availableDays: [], isActive: true, createdAt: '' }),
      ).toBe(true);
      expect(
        isLocalOnlyBookingLink({ id: 'clx-booking-server-1', slug: 'a', title: 'a', duration: 30, startHour: 9, endHour: 17, availableDays: [], isActive: true, createdAt: '' }),
      ).toBe(false);
    });
  });

  describe('mapServerBookingLink', () => {
    it('returns null for malformed records', () => {
      expect(mapServerBookingLink(null)).toBeNull();
      expect(mapServerBookingLink({ id: 'x' })).toBeNull();
      expect(mapServerBookingLink('a-string')).toBeNull();
    });

    it('applies sane defaults when optional server fields are missing', () => {
      const mapped = mapServerBookingLink({ id: 'x', slug: 's', title: 'T' });
      expect(mapped).toMatchObject({
        id: 'x',
        slug: 's',
        title: 'T',
        description: '',
        duration: 30,
        startHour: 9,
        endHour: 17,
        availableDays: [1, 2, 3, 4, 5],
        isActive: true,
      });
      expect(typeof mapped?.createdAt).toBe('string');
    });

    it('filters invalid weekday values instead of crashing getDayNamesSummary', () => {
      const mapped = mapServerBookingLink({
        id: 'x',
        slug: 's',
        title: 'T',
        availableDays: [1, 'x', 9, -1, 3],
      });
      expect(mapped?.availableDays).toEqual([1, 3]);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Render sanity: the modal renders the list rows with a Delete action and
  //    the honest offline banner anchor. (No @testing-library/react here, so
  //    interaction is covered at the helper level above.)
  // ---------------------------------------------------------------------------
  describe('BookingLinksModal markup', () => {
    it('renders the dialog with an honest empty state when closed it returns null', () => {
      const closed = renderToStaticMarkup(
        <BookingLinksModal isOpen={false} onClose={() => {}} />,
      );
      expect(closed).toBe('');

      const open = renderToStaticMarkup(<BookingLinksModal isOpen onClose={() => {}} />);
      expect(open).toContain('Booking Links');
      // Node-env render: no window/localStorage and no effects, so the list
      // starts empty — the empty state must be honest, not seeded samples.
      expect(open).toContain('No booking links created yet');
      expect(open).not.toContain('Strategy Session');
    });
  });
});
