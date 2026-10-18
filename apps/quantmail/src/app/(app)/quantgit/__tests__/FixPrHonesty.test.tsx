import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecurityTab } from '../components/SecurityTab';
import { INITIAL_SECURITY_ALERTS } from '../constants';

/**
 * Dependabot fix-PR honesty regression tests.
 *
 * The "Create fix PR" action used to fabricate a PR number locally
 * (`260 + Math.floor(Math.random() * 50) + 1`), toast
 * `Dependabot fix PR #<random> generated: ...`, and render a
 * `PR #<random> opened` badge — all without calling the backend and without
 * any PR existing. The honest behavior is: call the real
 * POST /api/repos/:id/security/dependabot/:alertId/fix-pr endpoint, surface
 * the backend's answer, and only ever display a PR number the backend
 * actually returned.
 */
const COMPONENT_PATH = fileURLToPath(
  new URL('../components/SecurityTab.tsx', import.meta.url),
);

function fixPrHandlerBody(): string {
  const source = readFileSync(COMPONENT_PATH, 'utf8');
  const start = source.indexOf('const handleCreateFixPR');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  };', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Dependabot fix-PR honesty (no invented PR numbers)', () => {
  it('the fix-PR handler never fabricates a PR number client-side', () => {
    const body = fixPrHandlerBody();
    // The old fabrication: `const nextPrId = 260 + Math.floor(Math.random() * 50) + 1`.
    expect(body).not.toContain('Math.random');
    // The old false claim: `Dependabot fix PR #${nextPrId} generated: ...`.
    expect(body).not.toContain('} generated');
  });

  it('the fix-PR handler calls the real backend endpoint instead of inventing success', () => {
    const body = fixPrHandlerBody();
    expect(body).toContain('/security/dependabot/');
    expect(body).toContain('/fix-pr');
    expect(body).toContain('apiFetchRaw');
  });

  it('renders the Create fix PR button with no pre-seeded "opened" badge', () => {
    const html = renderToStaticMarkup(
      <SecurityTab
        securityAlerts={INITIAL_SECURITY_ALERTS}
        showToast={vi.fn()}
        initialSubTab="dependabot"
      />,
    );
    expect(html).toContain('Create fix PR');
    // generatedFixPrs starts empty: no invented `PR #… opened` badge on load.
    expect(html).not.toContain('pr-created-');
  });

  it('the component never toasts a bare "generated" claim for the fix PR action', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8');
    expect(source).not.toMatch(/Dependabot fix PR #\$\{[^}]*\} generated/);
  });
});
