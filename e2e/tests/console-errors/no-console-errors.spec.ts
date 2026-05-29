import { test, expect } from '@playwright/test';

const PAGES_TO_CHECK = ['/', '/auth/login', '/dashboard'];

test.describe('Console Error Enforcement', () => {
  for (const pagePath of PAGES_TO_CHECK) {
    test(`should have zero console errors/warnings on ${pagePath}`, async ({ page }) => {
      const consoleMessages: { type: string; text: string }[] = [];

      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          consoleMessages.push({ type, text: msg.text() });
        }
      });

      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');

      if (consoleMessages.length > 0) {
        const summary = consoleMessages.map((m) => `[${m.type}] ${m.text}`).join('\n');
        expect(
          consoleMessages,
          `Found ${consoleMessages.length} console error(s)/warning(s) on ${pagePath}:\n${summary}`,
        ).toHaveLength(0);
      }
    });
  }
});
