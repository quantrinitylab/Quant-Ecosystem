import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-ISSUE-BODY-HONESTY — inline issue-detail "Original Post" fake body purge.
 *
 * The inline issue detail in IssuesTab.tsx rendered hardcoded fake body text
 * for EVERY issue ("Tracking issue for the CodeHub / QuantGit Smart HTTP
 * daemon ...", plus a `git -c key=value receive-pack` snippet), while the
 * real `selectedIssue.body` was never rendered. The honest modal
 * (QuantGitModals.tsx) already rendered the real body with a
 * "No description provided." fallback — the inline card must do the same.
 *
 * These tests pin that: the fake markers are gone from shipped source, and
 * the Original Post card renders the issue's real body (or an honest empty
 * state) instead of invented placeholder text.
 */

const COMPONENTS_ROOT = fileURLToPath(new URL('../components/', import.meta.url));
const TYPES_ROOT = fileURLToPath(new URL('../', import.meta.url));

const FABRICATED_BODY_MARKERS = [
  'Tracking issue for the CodeHub',
  'Companion to the Wave A tracking issue #250',
  'git -c key=value receive-pack',
  'versioned with application, zero state',
];

describe('QM-ISSUE-BODY-HONESTY inline issue detail', () => {
  const issuesTabSource = readFileSync(
    path.join(COMPONENTS_ROOT, 'IssuesTab.tsx'),
    'utf8',
  );

  it('contains no fabricated Original Post body markers', () => {
    const offenders = FABRICATED_BODY_MARKERS.filter((marker) =>
      issuesTabSource.includes(marker),
    );
    expect(offenders).toEqual([]);
  });

  it('renders the real selectedIssue.body in the Original Post card', () => {
    // The card must read from the issue's real body, not a hardcoded string.
    expect(issuesTabSource).toMatch(/selectedIssue\.body\?\.\s*trim\(\)/);
  });

  it('falls back to an honest empty state when the body is missing', () => {
    // Mirrors the honest modal in QuantGitModals.tsx.
    expect(issuesTabSource).toContain('No description provided.');
    const modalSource = readFileSync(
      path.join(COMPONENTS_ROOT, 'QuantGitModals.tsx'),
      'utf8',
    );
    expect(modalSource).toContain('No description provided.');
  });

  it('IssueItem still carries a body field for the real body', () => {
    const typesSource = readFileSync(path.join(TYPES_ROOT, 'types.ts'), 'utf8');
    expect(typesSource).toMatch(/body\?:\s*string/);
  });
});
