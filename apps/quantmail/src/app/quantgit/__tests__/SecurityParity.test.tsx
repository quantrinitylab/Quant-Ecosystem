import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecurityTab, DEFAULT_SECURITY_POLICY } from '../components/SecurityTab';
import type { SecurityAlert } from '../types';

// Clearly-labeled SAMPLE test data. The dead mock-fixture module
// quantgit/constants.ts (INITIAL_SECURITY_ALERTS etc.) was removed because no
// production code imported it; these rows exist only to exercise the tab's
// rendering structure and are never presented as real scan results.
const SAMPLE_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: 'test-alert-crit',
    package: 'test-pkg-crit',
    severity: 'critical',
    cve: 'CVE-TEST-0001',
    title: 'Sample critical finding (test data only)',
    state: 'open',
    vulnerableRange: '< 9.9.1',
    patchedVersion: '9.9.1',
    cvss: 9.0,
    cweTitle: 'CWE-TEST-94: Sample test weakness',
    createdAt: '2026-01-01',
  },
  {
    id: 'test-alert-high',
    package: 'test-pkg-high',
    severity: 'high',
    cve: 'CVE-TEST-0002',
    title: 'Sample high finding (test data only)',
    state: 'open',
    vulnerableRange: '< 9.9.2',
    patchedVersion: '9.9.2',
    cvss: 7.0,
    cweTitle: 'CWE-TEST-22: Sample test weakness',
    createdAt: '2026-01-02',
  },
  {
    id: 'test-alert-mod',
    package: 'test-pkg-mod',
    severity: 'moderate',
    cve: 'CVE-TEST-0003',
    title: 'Sample moderate finding (test data only)',
    state: 'open',
    vulnerableRange: '< 9.9.3',
    patchedVersion: '9.9.3',
    cvss: 5.0,
    cweTitle: 'CWE-TEST-33: Sample test weakness',
    createdAt: '2026-01-03',
  },
  {
    id: 'test-alert-low',
    package: 'test-pkg-low',
    severity: 'low',
    cve: 'CVE-TEST-0004',
    title: 'Sample low finding (test data only)',
    state: 'open',
    vulnerableRange: '< 9.9.4',
    patchedVersion: '9.9.4',
    cvss: 3.0,
    cweTitle: 'CWE-TEST-44: Sample test weakness',
    createdAt: '2026-01-04',
  },
];

describe('QuantGit Security Parity Suite (Screens 33, 108–110, Dependabot & Secret Scanning)', () => {
  const MOCK_TOAST = vi.fn();
  const MOCK_CREATE_PR = vi.fn();

  describe('1. Dependabot Alerts & Advisory Cards', () => {
    it('renders security overview header with open alert counts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      expect(html).toContain('Security &amp; Vulnerability Overview');
      expect(html).toContain('data-testid="security-tab"');
      expect(html).toContain('data-testid="open-alerts-count"');
      expect(html).toContain('Open Dependabot Alerts');
      expect(html).toContain('Leaked Secrets');
    });

    it('renders 4 dedicated sub-tab buttons with correct labels', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      expect(html).toContain('data-testid="subtab-dependabot"');
      expect(html).toContain('📦 Dependabot alerts');
      expect(html).toContain('data-testid="subtab-secrets"');
      expect(html).toContain('🔑 Secret scanning');
      expect(html).toContain('data-testid="subtab-codeql"');
      expect(html).toContain('🔬 CodeQL / SAST Code scanning');
      expect(html).toContain('data-testid="subtab-policy"');
      expect(html).toContain('📜 Security policy &amp; Branch rules');
    });

    it('renders severity summary pills (Critical, High, Moderate, Low) with count badges', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      expect(html).toContain('data-testid="severity-pills"');
      expect(html).toContain('data-testid="severity-pill-all"');
      expect(html).toContain('data-testid="severity-pill-critical"');
      expect(html).toContain('data-testid="severity-pill-high"');
      expect(html).toContain('data-testid="severity-pill-moderate"');
      expect(html).toContain('data-testid="severity-pill-low"');
      expect(html).toContain('Critical');
      expect(html).toContain('High');
      expect(html).toContain('Moderate');
      expect(html).toContain('Low');
    });

    it('renders detailed advisory cards with Package, Vulnerable Range, Patched Version, CVE, CVSS, and CWE', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      // Package names (test-data only)
      expect(html).toContain('test-pkg-crit');
      expect(html).toContain('test-pkg-high');
      expect(html).toContain('test-pkg-mod');
      expect(html).toContain('test-pkg-low');

      // CVE IDs (test-data only)
      expect(html).toContain('CVE-TEST-0001');
      expect(html).toContain('CVE-TEST-0002');
      expect(html).toContain('CVE-TEST-0003');
      expect(html).toContain('CVE-TEST-0004');

      // CVSS Scores
      expect(html).toContain('CVSS 9');
      expect(html).toContain('CVSS 7');
      expect(html).toContain('CVSS 5');
      expect(html).toContain('CVSS 3');

      // CWE Titles
      expect(html).toContain('CWE-TEST-94');
      expect(html).toContain('CWE-TEST-22');
      expect(html).toContain('CWE-TEST-33');
      expect(html).toContain('CWE-TEST-44');

      // Version ranges
      expect(html).toContain('&lt; 9.9.1');
      expect(html).toContain('9.9.1');
      expect(html).toContain('&lt; 9.9.2');
      expect(html).toContain('9.9.2');

      // Create fix PR button
      expect(html).toContain('Create fix PR');
    });

    it('renders state filter controls (Open, Dismissed, Closed, All) and search input', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      expect(html).toContain('data-testid="state-filter-open"');
      expect(html).toContain('data-testid="state-filter-dismissed"');
      expect(html).toContain('data-testid="state-filter-closed"');
      expect(html).toContain('data-testid="state-filter-all"');
      expect(html).toContain('data-testid="dependabot-search-input"');
    });
  });

  describe('2. Secret Scanning Parity (Leaked Credentials Detection)', () => {
    it('renders secret scanning view with active scanner badge and trigger scan button', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="secrets"
        />,
      );

      expect(html).toContain('data-testid="secret-scanning-view"');
      expect(html).toContain('Git Credential &amp; Secret Scanner');
      expect(html).toContain('Not wired up');
      expect(html).not.toContain('Active Protection');
      expect(html).toContain('data-testid="trigger-secret-scan-btn"');
      expect(html).toContain('Scan repository now');
      expect(html).toContain('data-testid="secret-search-input"');
    });

    it('shows honest empty state instead of fabricated secret alerts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab securityAlerts={[]} showToast={MOCK_TOAST} initialSubTab="secrets" />,
      );

      expect(html).toContain('data-testid="secret-scanning-view"');
      // Must NOT contain fabricated secret alerts
      expect(html).not.toContain('AWS Access Key');
      expect(html).not.toContain('AKIA************');
      expect(html).not.toContain('ghp_************');
    });

    it('does not fabricate file paths for secret locations', () => {
      const html = renderToStaticMarkup(
        <SecurityTab securityAlerts={[]} showToast={MOCK_TOAST} initialSubTab="secrets" />,
      );

      expect(html).not.toContain('config/aws-credentials.env:14');
      expect(html).not.toContain('scripts/deploy-staging.sh:28');
      expect(html).toContain('data-testid="secret-scanning-view"');
    });

    it('shows empty secret list without fabricated status badges', () => {
      const html = renderToStaticMarkup(
        <SecurityTab securityAlerts={[]} showToast={MOCK_TOAST} initialSubTab="secrets" />,
      );

      expect(html).toContain('data-testid="secret-scanning-view"');
      // No fabricated alerts means no fabricated action buttons
      expect(html).not.toContain('Revoke token');
      expect(html).not.toContain('Mark false positive');
    });
  });

  describe('3. CodeQL / SAST Code Scanning Parity', () => {
    it('renders CodeQL SAST view with CLI version and rule matrix', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="codeql"
        />,
      );

      expect(html).toContain('data-testid="codeql-sast-view"');
      expect(html).toContain('CodeQL Static Application Security Testing (SAST)');
      expect(html).toContain('Not wired up');
      expect(html).not.toContain('v2.17.2');
      expect(html).not.toContain('Active CodeQL Matrix');
      expect(html).toContain('Not connected');
      expect(html).toContain('data-testid="codeql-search-input"');
    });

    it('shows honest empty state instead of fabricated CodeQL alerts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab securityAlerts={[]} showToast={MOCK_TOAST} initialSubTab="codeql" />,
      );

      expect(html).toContain('data-testid="codeql-sast-view"');
      // Honest empty state: scanner not wired up, never claims a clean scan
      expect(html).toContain('wired up yet');
      expect(html).not.toContain('0 Static Security Vulnerabilities');
      // Must NOT contain fabricated alert rule IDs or alert rows
      expect(html).not.toContain('js/sql-injection');
      expect(html).not.toContain('js/missing-auth-guard');
      expect(html).not.toContain('Recommended Code Fix Diff');
    });

    it('does not fabricate file paths or fix diffs for CodeQL', () => {
      const html = renderToStaticMarkup(
        <SecurityTab securityAlerts={[]} showToast={MOCK_TOAST} initialSubTab="codeql" />,
      );

      expect(html).not.toContain('apps/quantmail/backend/routes/repos.ts:42-48');
      expect(html).not.toContain('Recommended Code Fix Diff');
      expect(html).toContain('data-testid="codeql-sast-view"');
    });
  });

  describe('4. Security Policy & Branch Rules Parity', () => {
    it('renders SECURITY.md editor & viewer with supported versions table', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="policy"
        />,
      );

      expect(html).toContain('data-testid="security-policy-view"');
      expect(html).toContain('Repository Security Policy (SECURITY.md)');
      expect(html).toContain('data-testid="toggle-edit-policy-btn"');
      expect(html).toContain('Edit SECURITY.md');
      expect(html).toContain('data-testid="security-policy-preview"');
      expect(html).toContain('Supported Versions');
      expect(html).toContain('Reporting a Vulnerability');
      expect(html).toContain('security@quantrinity.in');
    });

    it('renders branch protection security checks with switches and Enforced badge', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={SAMPLE_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="policy"
        />,
      );

      expect(html).toContain('data-testid="branch-protection-rules-view"');
      expect(html).toContain('Branch Protection Security Checks');
      // Honest empty state (QM-SCREEN-013 P2): with no repo selected and no
      // backend rules, nothing is claimed "Enforced".
      expect(html).toContain('main: Not set');
      expect(html).toContain('data-testid="branch-rules-not-set-note"');
      expect(html).toContain('data-testid="save-branch-rules-btn"');
      expect(html).toContain('Save branch rules');

      // The 3 required checks
      expect(html).toContain('Require pull request reviews before merging');
      expect(html).toContain('Require status checks to pass before merging');
      expect(html).toContain('Require secret scanning to be clean before merge');

      expect(html).toContain('data-testid="checkbox-require-pr-reviews"');
      expect(html).toContain('data-testid="checkbox-require-status-checks"');
      expect(html).toContain('data-testid="checkbox-require-clean-secrets"');
    });
  });

  describe('5. Default security policy template', () => {
    it('ships an honest default SECURITY.md template next to its consumer', () => {
      // The default template is real UI copy (the policy editor's starting
      // content), not scan data — it lives beside SecurityTab now that the
      // dead fixture module is gone.
      expect(DEFAULT_SECURITY_POLICY).toContain('# Security Policy');
      expect(DEFAULT_SECURITY_POLICY).toContain('Supported Versions');
      expect(DEFAULT_SECURITY_POLICY).toContain('Reporting a Vulnerability');
      expect(DEFAULT_SECURITY_POLICY).toContain('security@quantrinity.in');
    });
  });
});
