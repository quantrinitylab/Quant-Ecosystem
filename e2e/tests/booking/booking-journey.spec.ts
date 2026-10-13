import { test, expect } from '@playwright/test';

// ============================================================================
// QuantCalendar public booking journey — real browser E2E
// fix/qm-e2e-real-evidence
//
// What this proves: a guest can open a public booking link, see the REAL
// host meeting details (never seeded placeholders), pick a date, pick a slot,
// submit the visitor form, and reach the honest "Booking Confirmed!" state —
// end to end in a real Chromium.
//
// What is mocked: the BACKEND only. There is no staging database in this
// sandbox, so page.route() serves the same JSON contracts the Fastify backend
// implements (booking-link.service.ts): link details, slot availability, and
// the book POST. The FRONTEND is 100% real — the actual Next.js page, its
// real React state machine, its real fetch layer. Any mock is labeled
// SEEDED-BACKEND below; nothing about the UI under test is faked.
// ============================================================================

const SLUG = 'e2e-test-slug';

// SEEDED-BACKEND: mirrors the backend booking-link record contract.
const linkDetails = {
  success: true,
  data: {
    slug: SLUG,
    title: 'E2E Strategy Session',
    description: 'Seeded backend mock for the Playwright journey.',
    duration: 30,
    startHour: 9,
    endHour: 17,
    availableDays: [1, 2, 3, 4, 5],
    timezone: 'America/New_York',
    hostName: 'E2E Host',
    hostEmail: 'host@example.com',
    isActive: true,
  },
};

test.describe('public booking journey', () => {
  test.beforeEach(async ({ page }) => {
    // SEEDED-BACKEND route handlers.
    await page.route('**/api/calendar/booking/**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();

      if (method === 'POST' && url.pathname.endsWith('/book')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              event: { id: 'evt-e2e-1' },
              hostName: 'E2E Host',
              hostEmail: 'host@example.com',
            },
          }),
        });
        return;
      }

      if (url.pathname.endsWith('/slots')) {
        // One available slot tomorrow at 10:00 host time (UTC instant).
        const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
        start.setUTCHours(14, 0, 0, 0);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ start: start.toISOString(), end: end.toISOString(), available: true }],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(linkDetails),
      });
    });
  });

  test('guest books a slot: link loads → slot picked → form submitted → confirmed', async ({
    page,
  }) => {
    await page.goto(`/calendar/booking/${SLUG}`);

    // 1. Real host details replace the seeded placeholder — the meeting title
    //    comes from the backend record, never the hardcoded fallback.
    await expect(page.getByText('E2E Strategy Session').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Select a Date & Time')).toBeVisible();

    // 2. Slots render for the selected date (seeded backend returns one).
    const slotButton = page
      .locator('button', { hasText: 'Select →' })
      .first();
    await expect(slotButton).toBeVisible({ timeout: 15000 });
    await slotButton.click();

    // 3. Visitor form (step 2) — fill and confirm.
    await expect(page.getByPlaceholder('e.g. Sarah Connor')).toBeVisible();
    await page.getByPlaceholder('e.g. Sarah Connor').fill('E2E Guest');
    await page.getByPlaceholder('you@example.com').fill('guest@example.com');
    await page.getByText('Confirm Booking').click();

    // 4. Only a 2xx book response may advance to step 3.
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({
      timeout: 15000,
    });
  });

  test('404 link shows the honest dead-link panel, never a bookable slot', async ({
    page,
  }) => {
    await page.unroute('**/api/calendar/booking/**');
    await page.route('**/api/calendar/booking/**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'BOOKING_LINK_NOT_FOUND', message: 'Booking link not found' },
        }),
      });
    });

    await page.goto('/calendar/booking/does-not-exist-e2e');
    await expect(page.getByText('Booking link not found', { exact: false }).first()).toBeVisible({
      timeout: 30000,
    });
    // No slot selection is possible on a dead link.
    await expect(page.getByText('Select a Date & Time')).not.toBeVisible();
  });
});
