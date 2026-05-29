import { test, expect } from '@playwright/test';
import { runAxeAnalysis } from './a11y-utils';

const ROUTES_TO_TEST = ['/', '/auth/login', '/dashboard', '/compose'];

test.describe('Accessibility (axe-core)', () => {
  for (const route of ROUTES_TO_TEST) {
    test(`should have no critical or serious a11y violations on ${route}`, async ({ page }) => {
      await page.goto(route);

      const { violations, summary } = await runAxeAnalysis(page, {
        impactFilter: ['critical', 'serious'],
      });

      expect(violations, summary).toHaveLength(0);
    });
  }
});
