import { describe, it, expect, vi, beforeEach } from 'vitest';

// The tab talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import {
  toSecretScanningAlert,
  toCodeQLAlert,
  normalizeSecurityAlertsPayload,
} from '../app/quantgit/components/SecurityTab';

const SERVER_SECRET_ROW = {
  id: 'sec-1',
  secretType: 'AWS Access Key',
  rawMatch: 'AKIAIOSFODNN7EXAMPLE',
  maskedSecret: 'AKIA••••••••••••XYZ1',
  filePath: '.env',
  lineNumber: 12,
  detectedAt: '2026-10-13T10:20:00.000Z',
  status: 'active',
};

const SERVER_CODEQL_ROW = {
  id: 'codeql-1',
  ruleId: 'js/sql-injection',
  ruleName: 'SQL Injection',
  severity: 'high',
  filePath: 'src/db.ts',
  lineStart: 42,
  lineEnd: 44,
  description: 'Unescaped user input in SQL query',
  codeSnippet: 'query(`SELECT * FROM users WHERE id = ${id}`)',
  recommendedFix: 'Use parameterized queries',
  state: 'open',
};

describe('SecurityTab server alert-list wiring (fix/qm-securitytab-alerts-wired)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // toSecretScanningAlert — server row → tab shape
  // ---------------------------------------------------------------------------
  describe('toSecretScanningAlert', () => {
    it('normalizes a full server row into the tab shape', () => {
      expect(toSecretScanningAlert(SERVER_SECRET_ROW)).toEqual({
        id: 'sec-1',
        secretType: 'AWS Access Key',
        rawMatch: 'AKIAIOSFODNN7EXAMPLE',
        maskedSecret: 'AKIA••••••••••••XYZ1',
        filePath: '.env',
        lineNumber: 12,
        detectedAt: '2026-10-13T10:20:00.000Z',
        status: 'active',
        commitSha: undefined,
      });
    });

    it('keeps revoked and false_positive rows with their server status', () => {
      expect(
        toSecretScanningAlert({ ...SERVER_SECRET_ROW, id: 'sec-2', status: 'revoked' })?.status,
      ).toBe('revoked');
      expect(
        toSecretScanningAlert({ ...SERVER_SECRET_ROW, id: 'sec-3', status: 'false_positive' })
          ?.status,
      ).toBe('false_positive');
    });

    it('renders an unknown secret type verbatim instead of mapping it to a wrong known type', () => {
      const alert = toSecretScanningAlert({
        ...SERVER_SECRET_ROW,
        secretType: 'Stripe Live Key',
      });
      expect(alert?.secretType).toBe('Stripe Live Key');
    });

    it('drops rows missing id, maskedSecret, filePath, or with an unrecognized status', () => {
      // A row that cannot be rendered honestly is dropped, never fabricated.
      expect(toSecretScanningAlert({ ...SERVER_SECRET_ROW, id: '' })).toBeNull();
      expect(toSecretScanningAlert({ ...SERVER_SECRET_ROW, secretType: '' })).toBeNull();
      expect(toSecretScanningAlert({ ...SERVER_SECRET_ROW, maskedSecret: undefined })).toBeNull();
      expect(toSecretScanningAlert({ ...SERVER_SECRET_ROW, filePath: null })).toBeNull();
      // An unknown status gets no invented badge — the row is dropped.
      expect(
        toSecretScanningAlert({ ...SERVER_SECRET_ROW, status: 'pending_review' }),
      ).toBeNull();
      expect(toSecretScanningAlert(null)).toBeNull();
      expect(toSecretScanningAlert('nope')).toBeNull();
      expect(toSecretScanningAlert([])).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // toCodeQLAlert — server row → tab shape
  // ---------------------------------------------------------------------------
  describe('toCodeQLAlert', () => {
    it('normalizes a full server row into the tab shape', () => {
      expect(toCodeQLAlert(SERVER_CODEQL_ROW)).toEqual(SERVER_CODEQL_ROW);
    });

    it('drops rows with unrecognized severity or state instead of guessing', () => {
      expect(toCodeQLAlert({ ...SERVER_CODEQL_ROW, severity: 'unknown' })).toBeNull();
      expect(toCodeQLAlert({ ...SERVER_CODEQL_ROW, state: 'triaged' })).toBeNull();
    });

    it('drops rows missing the fields the UI needs to render', () => {
      expect(toCodeQLAlert({ ...SERVER_CODEQL_ROW, id: '' })).toBeNull();
      expect(toCodeQLAlert({ ...SERVER_CODEQL_ROW, ruleName: undefined })).toBeNull();
      expect(toCodeQLAlert({ ...SERVER_CODEQL_ROW, description: '' })).toBeNull();
      expect(toCodeQLAlert(null)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeSecurityAlertsPayload — GET /:id/security/alerts → tab state
  // ---------------------------------------------------------------------------
  describe('normalizeSecurityAlertsPayload', () => {
    it('returns the policy plus both alert lists from a full payload', () => {
      const result = normalizeSecurityAlertsPayload({
        securityPolicy: '# Security Policy',
        secrets: [SERVER_SECRET_ROW],
        codeql: [SERVER_CODEQL_ROW],
      });
      expect(result.policy).toBe('# Security Policy');
      expect(result.secrets).toHaveLength(1);
      expect(result.secrets[0]).toMatchObject({ id: 'sec-1', status: 'active' });
      expect(result.codeql).toHaveLength(1);
      expect(result.codeql[0]).toMatchObject({ id: 'codeql-1', state: 'open' });
    });

    it('keeps the honest empty state when the server returns no lists', () => {
      const result = normalizeSecurityAlertsPayload({ securityPolicy: null });
      expect(result.policy).toBeNull();
      expect(result.dependabot).toEqual([]);
      expect(result.secrets).toEqual([]);
      expect(result.codeql).toEqual([]);
    });

    it('ignores a non-string policy, non-array lists, and drops malformed rows', () => {
      const result = normalizeSecurityAlertsPayload({
        securityPolicy: 42,
        secrets: [{ id: 'bad-row' }, 'nope', null],
        codeql: 'not-an-array',
      });
      expect(result.policy).toBeNull();
      expect(result.secrets).toEqual([]);
      expect(result.codeql).toEqual([]);
    });

    it('handles a null or missing envelope without inventing rows', () => {
      expect(normalizeSecurityAlertsPayload(null)).toEqual({
        policy: null,
        dependabot: [],
        secrets: [],
        codeql: [],
      });
      expect(normalizeSecurityAlertsPayload(undefined)).toEqual({
        policy: null,
        dependabot: [],
        secrets: [],
        codeql: [],
      });
    });
  });
});
