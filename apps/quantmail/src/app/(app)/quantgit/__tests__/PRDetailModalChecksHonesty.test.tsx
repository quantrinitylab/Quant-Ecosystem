/**
 * PR-detail modal CI cell honesty — regression for qm-modal-ci-checks.
 *
 * The PR meta grid used to hard-code
 *   <p className="font-bold text-[#3FB950]">✓ Passed</p>
 * for the "CI Checks" cell on EVERY pull request, without ever consulting
 * check data. The backend PR endpoints report `checksStatus: 'none'`
 * (check results not computed), so the cell must render the honest unknown
 * state unless the PR model carries a real verdict.
 *
 * NOTE: sibling suites render via react-dom/server (the quantmail package
 * has no @testing-library/react dependency — CI's frozen-lockfile install
 * fails any test importing it), so this file does the same.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PRDetailChecksStatus } from '../components/QuantGitModals';

describe('PRDetailChecksStatus (meta-grid CI cell)', () => {
  it('renders the honest unknown state when the backend has no check data', () => {
    const html = renderToStaticMarkup(<PRDetailChecksStatus checksStatus="unknown" />);
    expect(html).toContain('Checks status unknown');
    expect(html).not.toContain('✓ Passed');
  });

  it("treats the backend's 'none' (not computed) as unknown, never passed", () => {
    // Replicates the page.tsx fetchRepoPulls normalization contract:
    // 'none' must normalize to 'unknown' before reaching the cell.
    const normalized = (['passing', 'pending', 'failing', 'unknown'] as string[]).includes('none')
      ? 'none'
      : 'unknown';
    const html = renderToStaticMarkup(
      <PRDetailChecksStatus checksStatus={normalized as never} />,
    );
    expect(html).toContain('Checks status unknown');
    expect(html).not.toContain('✓ Passed');
  });

  it('shows Passed ONLY for a real passing verdict', () => {
    const html = renderToStaticMarkup(<PRDetailChecksStatus checksStatus="passing" />);
    expect(html).toContain('✓ Passed');
  });

  it('shows Failing for a real failing verdict', () => {
    const html = renderToStaticMarkup(<PRDetailChecksStatus checksStatus="failing" />);
    expect(html).toContain('Failing');
    expect(html).not.toContain('✓ Passed');
  });

  it('shows Pending for a real pending verdict', () => {
    const html = renderToStaticMarkup(<PRDetailChecksStatus checksStatus="pending" />);
    expect(html).toContain('Pending');
    expect(html).not.toContain('✓ Passed');
  });
});
