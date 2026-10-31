import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeSecurityAlertsPayload,
  toDependabotAlert,
} from '../components/SecurityTab';

/**
 * Dependabot list wiring + fix-PR callback honesty (fix/qm-securitytab-fake-pr).
 *
 * Two remnants of the original fake-PR finding survived the backend-call fix:
 * (1) the GET /:id/security/alerts effect normalized only secrets and codeql
 * and discarded the backend's `dependabot` list, so the Dependabot sub-tab
 * could only show caller props — and page.tsx never sets those — leaving the
 * "Create fix PR" button unreachable from any server data; (2) the
 * onCreateFixPR parent callback fired unconditionally after the backend call,
 * even on the 501 failure path where no PR exists.
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

const VALID_ROW = {
  id: 'dep-1',
  package: 'lodash',
  severity: 'high',
  cve: 'CVE-2024-0001',
  title: 'Prototype pollution in lodash',
  state: 'open',
  vulnerableRange: '< 4.17.21',
  patchedVersion: '4.17.21',
  cvss: 7.5,
  cweTitle: 'CWE-1321',
  createdAt: '2026-01-01',
};

describe('Dependabot server-list wiring (no dropped lists, no invented rows)', () => {
  it('normalizes a valid server Dependabot row verbatim', () => {
    const alert = toDependabotAlert(VALID_ROW);
    expect(alert).toMatchObject({
      id: 'dep-1',
      package: 'lodash',
      severity: 'high',
      cve: 'CVE-2024-0001',
      title: 'Prototype pollution in lodash',
      state: 'open',
      vulnerableRange: '< 4.17.21',
      patchedVersion: '4.17.21',
      cvss: 7.5,
      cweTitle: 'CWE-1321',
    });
  });

  it('drops unrenderable rows instead of inventing values for them', () => {
    const rows = [
      VALID_ROW,
      { ...VALID_ROW, id: 'bad-1', package: '' },
      { ...VALID_ROW, id: 'bad-2', cve: '' },
      { ...VALID_ROW, id: 'bad-3', title: '' },
      { ...VALID_ROW, id: 'bad-4', severity: 'unknown' },
      { ...VALID_ROW, id: 'bad-5', state: 'bogus' },
      { ...VALID_ROW, id: 'bad-6', severity: 'critical', state: 'dismissed' },
    ];
    const out = normalizeSecurityAlertsPayload({ dependabot: rows });
    expect(out.dependabot.map((a) => a.id)).toEqual(['dep-1', 'bad-6']);
  });

  it('keeps the Dependabot list empty (never fabricated) when the server sends none', () => {
    expect(normalizeSecurityAlertsPayload({}).dependabot).toEqual([]);
    expect(normalizeSecurityAlertsPayload({ dependabot: 'nope' }).dependabot).toEqual([]);
    expect(normalizeSecurityAlertsPayload({ dependabot: [] }).dependabot).toEqual([]);
  });

  it('still normalizes the secrets/codeql lists alongside dependabot', () => {
    const out = normalizeSecurityAlertsPayload({
      dependabot: [VALID_ROW],
      secrets: [
        {
          id: 'sec-1',
          secretType: 'AWS Access Key',
          maskedSecret: 'AKIA****',
          filePath: 'config.ts',
          status: 'active',
        },
      ],
      codeql: [],
    });
    expect(out.dependabot).toHaveLength(1);
    expect(out.secrets).toHaveLength(1);
    expect(out.secrets[0].id).toBe('sec-1');
  });
});

describe('fix-PR parent callback fires only for a real PR', () => {
  it('the handler never invokes onCreateFixPR on the failure path', () => {
    const body = fixPrHandlerBody();
    // Everything after the final catch block runs on failure (or after an
    // early return): the callback must not appear there. It may only appear
    // inside the try block's confirmed-prId branch.
    const failureTail = body.slice(body.lastIndexOf('} catch'));
    expect(failureTail).not.toContain('onCreateFixPR');
    expect(body).toContain('onCreateFixPR');
  });

  it('the handler still calls the real backend endpoint', () => {
    const body = fixPrHandlerBody();
    expect(body).toContain('/security/dependabot/');
    expect(body).toContain('/fix-pr');
    expect(body).toContain('apiFetchRaw');
    expect(body).not.toContain('Math.random');
  });
});
