import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecurityTab } from '../components/SecurityTab';
import {
  INITIAL_SECURITY_ALERTS,
  INITIAL_SECRET_ALERTS,
  INITIAL_CODEQL_ALERTS,
  INITIAL_BRANCH_SECURITY_RULES,
  DEFAULT_SECURITY_POLICY,
} from '../constants';
import type { SecurityAlert, SecretScanningAlert, CodeQLAlert } from '../types';

describe('QuantGit Security Parity Suite (Screens 33, 108–110, Dependabot & Secret Scanning)', () => {
  const MOCK_TOAST = vi.fn();
  const MOCK_CREATE_PR = vi.fn();

  describe('1. Dependabot Alerts & Advisory Cards', () => {
    it('renders security overview header with open alert counts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={INITIAL_SECURITY_ALERTS}
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="dependabot"
        />,
      );

      // Package names
      expect(html).toContain('express');
      expect(html).toContain('tar');
      expect(html).toContain('micromatch');
      expect(html).toContain('ws');

      // CVE IDs
      expect(html).toContain('CVE-2026-3849');
      expect(html).toContain('CVE-2024-37890');
      expect(html).toContain('CVE-2024-4067');
      expect(html).toContain('CVE-2024-37891');

      // CVSS Scores
      expect(html).toContain('CVSS 9.8');
      expect(html).toContain('CVSS 7.5');
      expect(html).toContain('CVSS 5.3');
      expect(html).toContain('CVSS 3.7');

      // CWE Titles
      expect(html).toContain('CWE-94');
      expect(html).toContain('CWE-22');
      expect(html).toContain('CWE-1333');
      expect(html).toContain('CWE-208');

      // Version ranges
      expect(html).toContain('&lt; 4.18.2');
      expect(html).toContain('4.18.2');
      expect(html).toContain('&lt; 6.2.1');
      expect(html).toContain('6.2.1');

      // Create fix PR button
      expect(html).toContain('Create fix PR');
    });

    it('renders state filter controls (Open, Dismissed, Closed, All) and search input', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={INITIAL_SECURITY_ALERTS}
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="secrets"
        />,
      );

      expect(html).toContain('data-testid="secret-scanning-view"');
      expect(html).toContain('Git Credential &amp; Secret Scanner');
      expect(html).toContain('Active Protection');
      expect(html).toContain('data-testid="trigger-secret-scan-btn"');
      expect(html).toContain('Scan repository now');
      expect(html).toContain('data-testid="secret-search-input"');
    });

    it('shows honest empty state instead of fabricated secret alerts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[]}
          showToast={MOCK_TOAST}
          initialSubTab="secrets"
        />,
      );

      expect(html).toContain('data-testid="secret-scanning-view"');
      // Must NOT contain fabricated secret alerts
      expect(html).not.toContain('AWS Access Key');
      expect(html).not.toContain('AKIA************');
      expect(html).not.toContain('ghp_************');
    });

    it('does not fabricate file paths for secret locations', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[]}
          showToast={MOCK_TOAST}
          initialSubTab="secrets"
        />,
      );

      expect(html).not.toContain('config/aws-credentials.env:14');
      expect(html).not.toContain('scripts/deploy-staging.sh:28');
      expect(html).toContain('data-testid="secret-scanning-view"');
    });

    it('shows empty secret list without fabricated status badges', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[]}
          showToast={MOCK_TOAST}
          initialSubTab="secrets"
        />,
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="codeql"
        />,
      );

      expect(html).toContain('data-testid="codeql-sast-view"');
      expect(html).toContain('CodeQL Static Application Security Testing (SAST)');
      expect(html).toContain('v2.17.2');
      expect(html).toContain('security-extended');
      expect(html).toContain('data-testid="codeql-search-input"');
    });

    it('shows honest empty state instead of fabricated CodeQL alerts', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[]}
          showToast={MOCK_TOAST}
          initialSubTab="codeql"
        />,
      );

      expect(html).toContain('data-testid="codeql-sast-view"');
      // Honest empty state: 0 vulnerabilities reported
      expect(html).toContain('0 Static Security Vulnerabilities');
      // Must NOT contain fabricated alert rule IDs or alert rows
      expect(html).not.toContain('js/sql-injection');
      expect(html).not.toContain('js/missing-auth-guard');
      expect(html).not.toContain('Recommended Code Fix Diff');
    });

    it('does not fabricate file paths or fix diffs for CodeQL', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[]}
          showToast={MOCK_TOAST}
          initialSubTab="codeql"
        />,
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
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
          securityAlerts={INITIAL_SECURITY_ALERTS}
          showToast={MOCK_TOAST}
          initialSubTab="policy"
        />,
      );

      expect(html).toContain('data-testid="branch-protection-rules-view"');
      expect(html).toContain('Branch Protection Security Checks');
      expect(html).toContain('main: Enforced');
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

  describe('5. Security Alerts Data Contracts', () => {
    it('exports rich constants conforming to GitHub security parity schema', () => {
      expect(INITIAL_SECURITY_ALERTS.length).toBeGreaterThanOrEqual(4);
      const cveAlert = INITIAL_SECURITY_ALERTS.find((a) => a.cve === 'CVE-2026-3849');
      expect(cveAlert).toBeDefined();
      expect(cveAlert?.package).toBe('express');
      expect(cveAlert?.cvss).toBe(9.8);
      expect(cveAlert?.vulnerableRange).toBe('< 4.18.2');
      expect(cveAlert?.patchedVersion).toBe('4.18.2');

      expect(INITIAL_SECRET_ALERTS.length).toBeGreaterThanOrEqual(5);
      const awsSecret = INITIAL_SECRET_ALERTS.find((s) => s.secretType === 'AWS Access Key');
      expect(awsSecret).toBeDefined();
      expect(awsSecret?.maskedSecret).toContain('AKIA');
      expect(awsSecret?.lineNumber).toBe(14);

      expect(INITIAL_CODEQL_ALERTS.length).toBeGreaterThanOrEqual(4);
      const sqlAlert = INITIAL_CODEQL_ALERTS.find((c) => c.ruleId === 'js/sql-injection');
      expect(sqlAlert).toBeDefined();
      expect(sqlAlert?.severity).toBe('critical');

      expect(INITIAL_BRANCH_SECURITY_RULES.requirePullRequestReviews).toBe(true);
      expect(INITIAL_BRANCH_SECURITY_RULES.requireStatusChecks).toBe(true);
      expect(INITIAL_BRANCH_SECURITY_RULES.requireCleanSecretScanning).toBe(true);

      expect(DEFAULT_SECURITY_POLICY).toContain('Reporting a Vulnerability');
    });
  });
});
