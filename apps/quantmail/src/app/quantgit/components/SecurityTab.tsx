'use client';

// ============================================================================
// QuantGit — GitHub Sovereign Parity Security Suite
// Dependabot, Secret Scanning, CodeQL SAST, and Security Policy & Branch Rules
// ============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import type {
  SecurityAlert,
  SecretScanningAlert,
  CodeQLAlert,
  CodeQLSeverity,
  BranchSecurityRules,
  SecurityTabSubTab,
  SecuritySeverity,
  SecurityAlertState,
  SecretAlertStatus,
  SecretType,
  Repo,
} from '../types';
import { apiFetchRaw } from '@quant/api-client';

// Default SECURITY.md template for the Security Policy editor. Lives here
// (next to its only consumer) after the dead mock-fixture module
// apps/quantmail/src/app/quantgit/constants.ts was removed — no production
// code ever imported the fixture data, only this policy string.
export const DEFAULT_SECURITY_POLICY = `# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| 0.9.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately instead of opening a public issue:

1. **Email**: security@quantrinity.in

Please do not disclose security issues publicly until a fix has been released.
`;

export interface SecurityTabProps {
  securityAlerts?: SecurityAlert[];
  showToast?: (message: string) => void;
  selectedRepo?: Repo | null;
  repoId?: string;
  initialSubTab?: SecurityTabSubTab;
  onCreateFixPR?: (pkg: string, cve: string, version: string) => void;
}

/**
 * Revoke a leaked credential via the REAL backend endpoint
 * POST /api/repos/:id/security/secrets/:alertId/revoke (Next proxy -> Fastify,
 * which persists status='revoked' in the server store).
 *
 * The success toast is only warranted when the server confirms
 * data.status === 'revoked'. Any other outcome returns ok:false with an
 * honest message and the caller must NOT flip local state or toast success.
 * Exported for unit tests (component handlers are not directly testable with
 * renderToStaticMarkup).
 */
export type RevokeSecretResult = { ok: true; message: string } | { ok: false; message: string };

export async function revokeSecretOnServer(
  targetRepo: string,
  alertId: string,
): Promise<RevokeSecretResult> {
  try {
    const res = await apiFetchRaw(
      `/api/repos/${encodeURIComponent(targetRepo)}/security/secrets/${encodeURIComponent(alertId)}/revoke`,
      { method: 'POST' },
    );
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { status?: string; message?: string };
      error?: { message?: string; code?: string };
    } | null;
    if (res.ok && json?.success && json?.data?.status === 'revoked') {
      return { ok: true, message: json.data.message || 'Leaked credential revoked.' };
    }
    // Server refused or returned something unexpected — surface its honest
    // message (e.g. 404 ALERT_NOT_FOUND) instead of inventing one.
    return {
      ok: false,
      message:
        json?.error?.message ||
        'Revoke failed — the credential is still active. Nothing was changed.',
    };
  } catch {
    return {
      ok: false,
      message: 'Revoke request failed — the credential is still active. Nothing was changed.',
    };
  }
}

/**
 * Apply a CodeQL recommended fix via the REAL backend endpoint
 * POST /api/repos/:id/security/codeql/:alertId/fix (Next proxy -> Fastify).
 *
 * There is currently no fix engine: the endpoint honestly refuses with 501
 * CODEQL_FIX_NOT_SUPPORTED until patch generation is wired up. This helper
 * NEVER claims a patch was applied unless the server confirms
 * data.status === 'fixed'. Any other outcome returns ok:false with an honest
 * message and the caller must NOT flip local state or toast success.
 * Exported for unit tests (component handlers are not directly testable with
 * renderToStaticMarkup).
 */
export type ApplyCodeqlFixResult = { ok: true; message: string } | { ok: false; message: string };

export async function applyCodeqlFixOnServer(
  targetRepo: string,
  alertId: string,
): Promise<ApplyCodeqlFixResult> {
  try {
    const res = await apiFetchRaw(
      `/api/repos/${encodeURIComponent(targetRepo)}/security/codeql/${encodeURIComponent(alertId)}/fix`,
      { method: 'POST' },
    );
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { status?: string; message?: string };
      error?: { message?: string; code?: string };
    } | null;
    if (res.ok && json?.success && json?.data?.status === 'fixed') {
      return { ok: true, message: json.data.message || 'CodeQL fix applied.' };
    }
    // Server refused or returned something unexpected — surface its honest
    // message (e.g. 501 CODEQL_FIX_NOT_SUPPORTED, 404 ALERT_NOT_FOUND) instead
    // of inventing a success claim.
    return {
      ok: false,
      message:
        json?.error?.message ||
        'CodeQL auto-fix is not wired up yet for this alert. No code was changed.',
    };
  } catch {
    return {
      ok: false,
      message: 'Fix request failed — no code was changed and no patch was applied.',
    };
  }
}

/**
 * Mark a secret-scanning alert as false positive via the REAL backend endpoint
 * POST /api/repos/:id/security/secrets/:alertId/false-positive (Next proxy ->
 * Fastify, which persists status='false_positive' in the server store).
 *
 * The success toast is only warranted when the server confirms
 * data.status === 'false_positive'. Any other outcome returns ok:false with an
 * honest message and the caller must NOT flip local state or toast success.
 * Exported for unit tests (component handlers are not directly testable with
 * renderToStaticMarkup).
 */
export type MarkSecretFalsePositiveResult = { ok: true; message: string } | { ok: false; message: string };

export async function markSecretFalsePositiveOnServer(
  targetRepo: string,
  alertId: string,
): Promise<MarkSecretFalsePositiveResult> {
  try {
    const res = await apiFetchRaw(
      `/api/repos/${encodeURIComponent(targetRepo)}/security/secrets/${encodeURIComponent(alertId)}/false-positive`,
      { method: 'POST' },
    );
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { status?: string; message?: string };
      error?: { message?: string; code?: string };
    } | null;
    if (res.ok && json?.success && json?.data?.status === 'false_positive') {
      return { ok: true, message: json.data.message || 'Secret alert marked as false positive.' };
    }
    // Server refused or returned something unexpected — surface its honest
    // message (e.g. 404 ALERT_NOT_FOUND) instead of inventing one.
    return {
      ok: false,
      message:
        json?.error?.message ||
        'Could not mark the alert as false positive. Nothing was changed.',
    };
  } catch {
    return {
      ok: false,
      message: 'False-positive request failed — the alert was not updated. Nothing was changed.',
    };
  }
}

// ---------------------------------------------------------------------------
// Server alert-list wiring (fix/qm-securitytab-alerts-wired)
// ---------------------------------------------------------------------------
//
// GET /:id/security/alerts returns the server's stored alert lists as
// data.secrets and data.codeql (see backend/routes/repos.ts). The tab used to
// read only data.securityPolicy and discard both lists, so the secrets and
// CodeQL sub-tabs could never render real server rows — the real revoke and
// false-positive endpoints were unreachable from the UI.
//
// These helpers normalize the server rows into the tab's shapes. A row that
// lacks the fields the UI needs to render (id, type/rule, location, masked
// value, and a recognizable status/state) is DROPPED — never rendered with
// invented placeholders. The UI shows exactly what the server returned.

const SECRET_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'revoked',
  'false_positive',
]);
const CODEQL_SEVERITIES: ReadonlySet<string> = new Set([
  'critical',
  'high',
  'medium',
  'low',
]);
const CODEQL_STATES: ReadonlySet<string> = new Set(['open', 'fixed', 'dismissed']);

/**
 * Normalize one server secret-scanning row into SecretScanningAlert.
 * Returns null when the row is not renderable (missing id, secretType,
 * maskedSecret, filePath, or an unrecognized status) — such rows are
 * dropped rather than rendered with fabricated values.
 * Exported for unit tests (component handlers are not directly testable with
 * renderToStaticMarkup).
 */
export function toSecretScanningAlert(raw: unknown): SecretScanningAlert | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.secretType !== 'string' || !row.secretType) return null;
  if (typeof row.maskedSecret !== 'string' || !row.maskedSecret) return null;
  if (typeof row.filePath !== 'string' || !row.filePath) return null;
  // An unrecognized status cannot be rendered honestly (it would need an
  // invented badge) — drop the row instead of guessing 'active'.
  if (typeof row.status !== 'string' || !SECRET_STATUSES.has(row.status)) return null;
  return {
    id: row.id,
    // The server may send a secret type outside the documented union; render
    // the server's own label verbatim rather than mapping it to a wrong
    // known type.
    secretType: row.secretType as unknown as SecretType,
    rawMatch: typeof row.rawMatch === 'string' ? row.rawMatch : undefined,
    maskedSecret: row.maskedSecret,
    filePath: row.filePath,
    lineNumber: typeof row.lineNumber === 'number' ? row.lineNumber : 0,
    detectedAt:
      typeof row.detectedAt === 'string' && row.detectedAt ? row.detectedAt : 'Recently',
    status: row.status as unknown as SecretAlertStatus,
    commitSha: typeof row.commitSha === 'string' ? row.commitSha : undefined,
  };
}

/**
 * Normalize one server CodeQL row into CodeQLAlert.
 * Returns null when the row is not renderable (missing id, ruleId, ruleName,
 * filePath, description, or an unrecognized severity/state).
 * Exported for unit tests.
 */
export function toCodeQLAlert(raw: unknown): CodeQLAlert | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.ruleId !== 'string' || !row.ruleId) return null;
  if (typeof row.ruleName !== 'string' || !row.ruleName) return null;
  if (typeof row.severity !== 'string' || !CODEQL_SEVERITIES.has(row.severity)) return null;
  if (typeof row.filePath !== 'string' || !row.filePath) return null;
  if (typeof row.description !== 'string' || !row.description) return null;
  if (typeof row.state !== 'string' || !CODEQL_STATES.has(row.state)) return null;
  return {
    id: row.id,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    severity: row.severity as unknown as CodeQLSeverity,
    filePath: row.filePath,
    lineStart: typeof row.lineStart === 'number' ? row.lineStart : 0,
    lineEnd: typeof row.lineEnd === 'number' ? row.lineEnd : 0,
    description: row.description,
    codeSnippet: typeof row.codeSnippet === 'string' ? row.codeSnippet : '',
    recommendedFix: typeof row.recommendedFix === 'string' ? row.recommendedFix : '',
    state: row.state as unknown as CodeQLAlert['state'],
  };
}

/**
 * The alert-bearing slice of the GET /:id/security/alerts response envelope.
 */
export type SecurityAlertsPayload = {
  securityPolicy?: unknown;
  dependabot?: unknown;
  secrets?: unknown;
  codeql?: unknown;
};

const DEPENDABOT_SEVERITIES: ReadonlySet<string> = new Set([
  'critical',
  'high',
  'moderate',
  'low',
]);
const DEPENDABOT_STATES: ReadonlySet<string> = new Set([
  'open',
  'resolved',
  'dismissed',
  'closed',
]);

/**
 * Normalize one server Dependabot row into SecurityAlert.
 * Returns null when the row is not renderable (missing id, package, cve,
 * title, or an unrecognized severity/state) — such rows are dropped rather
 * than rendered with fabricated values. Optional fields pass through only
 * when correctly typed; nothing is invented (the card render already guards
 * missing cvss/cweTitle and falls back for missing version ranges).
 * Exported for unit tests.
 *
 * WHY THIS EXISTS (fix/qm-securitytab-fake-pr): the GET /:id/security/alerts
 * effect used to normalize only secrets and codeql and discard the
 * backend's `dependabot` list, so the Dependabot sub-tab could only ever
 * show caller-passed props — and page.tsx never sets those (its
 * securityAlerts state stays []). The "Create fix PR" button was therefore
 * unreachable from any server data. Wiring the list through here makes the
 * button reachable the moment a real scanner seeds the store.
 */
export function toDependabotAlert(raw: unknown): SecurityAlert | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.package !== 'string' || !row.package) return null;
  if (typeof row.severity !== 'string' || !DEPENDABOT_SEVERITIES.has(row.severity))
    return null;
  if (typeof row.cve !== 'string' || !row.cve) return null;
  if (typeof row.title !== 'string' || !row.title) return null;
  if (typeof row.state !== 'string' || !DEPENDABOT_STATES.has(row.state)) return null;
  return {
    id: row.id,
    package: row.package,
    severity: row.severity as unknown as SecuritySeverity,
    cve: row.cve,
    title: row.title,
    state: row.state as unknown as SecurityAlertState,
    vulnerableRange: typeof row.vulnerableRange === 'string' ? row.vulnerableRange : undefined,
    patchedVersion: typeof row.patchedVersion === 'string' ? row.patchedVersion : undefined,
    cvss: typeof row.cvss === 'number' ? row.cvss : undefined,
    cweTitle: typeof row.cweTitle === 'string' ? row.cweTitle : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
    dismissedReason: typeof row.dismissedReason === 'string' ? row.dismissedReason : undefined,
    fixPrId: typeof row.fixPrId === 'number' ? row.fixPrId : undefined,
  };
}

/**
 * Normalize the GET /:id/security/alerts envelope's data payload into what
 * the tab renders: the saved policy plus the server's stored alert lists.
 * Missing or non-array lists stay empty — the sub-tabs keep their honest
 * empty state instead of rendering fabricated rows.
 * Exported for unit tests.
 */
export function normalizeSecurityAlertsPayload(data: unknown): {
  policy: string | null;
  dependabot: SecurityAlert[];
  secrets: SecretScanningAlert[];
  codeql: CodeQLAlert[];
} {
  const payload = (data ?? {}) as SecurityAlertsPayload;
  return {
    policy: typeof payload.securityPolicy === 'string' ? payload.securityPolicy : null,
    dependabot: Array.isArray(payload.dependabot)
      ? payload.dependabot
          .map(toDependabotAlert)
          .filter((a): a is SecurityAlert => a !== null)
      : [],
    secrets: Array.isArray(payload.secrets)
      ? payload.secrets
          .map(toSecretScanningAlert)
          .filter((a): a is SecretScanningAlert => a !== null)
      : [],
    codeql: Array.isArray(payload.codeql)
      ? payload.codeql.map(toCodeQLAlert).filter((a): a is CodeQLAlert => a !== null)
      : [],
  };
}

export function SecurityTab({
  securityAlerts: propAlerts,
  showToast = () => {},
  selectedRepo,
  repoId,
  initialSubTab = 'dependabot',
  onCreateFixPR,
}: SecurityTabProps) {
  // Sub-Tab Navigation
  const [activeSubTab, setActiveSubTab] = useState<SecurityTabSubTab>(initialSubTab);

  // 1. Dependabot Alerts State — only real scan results, never fake alerts.
  const [dependabotAlerts, setDependabotAlerts] = useState<SecurityAlert[]>(() => {
    if (propAlerts && propAlerts.length > 0) {
      return propAlerts.map((pa) => ({
        ...pa,
        vulnerableRange: pa.vulnerableRange || '< latest',
        patchedVersion: pa.patchedVersion || 'latest',
        cvss:
          pa.cvss ??
          (pa.severity === 'critical' ? 9.5 : pa.severity === 'high' ? 7.8 : 5.0),
        cweTitle: pa.cweTitle || 'CWE-Unknown Security Advisory',
        createdAt: pa.createdAt || 'Recently',
      }));
    }
    // Genuine empty state — no scan results yet, no fabricated alerts.
    return [];
  });

  const [selectedSeverity, setSelectedSeverity] = useState<SecuritySeverity | 'all'>('all');
  const [dependabotStateFilter, setDependabotStateFilter] = useState<
    'all' | 'open' | 'dismissed' | 'closed'
  >('open');
  const [dependabotSearch, setDependabotSearch] = useState('');
  const [generatedFixPrs, setGeneratedFixPrs] = useState<Record<string, number>>({});

  // 2. Secret Scanning State
  // Genuine empty state — no fabricated secret alerts.
  const [secretAlerts, setSecretAlerts] = useState<SecretScanningAlert[]>([]);
  const [secretSearch, setSecretSearch] = useState('');
  const [secretStatusFilter, setSecretStatusFilter] = useState<'all' | SecretAlertStatus>('all');
  const [isScanningSecrets, setIsScanningSecrets] = useState(false);
  // Per-alert in-flight revoke markers — honest loading state while the real
  // backend POST /api/repos/:id/security/secrets/:alertId/revoke is pending.
  // The alert's status is NEVER flipped until the server confirms 'revoked',
  // so a failed revoke needs no rollback: no false state was ever rendered.
  const [revokingSecretIds, setRevokingSecretIds] = useState<ReadonlySet<string>>(new Set());
  // Per-alert in-flight false-positive markers — honest loading state while the
  // real backend POST
  // /api/repos/:id/security/secrets/:alertId/false-positive is pending.
  // The alert's status is NEVER flipped until the server confirms
  // 'false_positive', so a failed request needs no rollback: no false state
  // was ever rendered.
  const [markingFalsePositiveIds, setMarkingFalsePositiveIds] =
    useState<ReadonlySet<string>>(new Set());

  // 3. CodeQL / SAST State
  // Genuine empty state — no fabricated CodeQL alerts.
  const [codeqlAlerts, setCodeqlAlerts] = useState<CodeQLAlert[]>([]);
  const [codeqlSearch, setCodeqlSearch] = useState('');
  const [selectedCodeqlSeverity, setSelectedCodeqlSeverity] = useState<
    'all' | 'critical' | 'high' | 'medium' | 'low'
  >('all');
  // Per-alert in-flight CodeQL fix markers — honest loading state while the
  // real backend POST /api/repos/:id/security/codeql/:alertId/fix is pending.
  // The alert's state is NEVER flipped until the server confirms 'fixed',
  // so a refused fix needs no rollback: no false state was ever rendered.
  const [applyingCodeqlIds, setApplyingCodeqlIds] = useState<ReadonlySet<string>>(new Set());

  // 4. Security Policy & Branch Rules State
  const [securityPolicy, setSecurityPolicy] = useState<string>(DEFAULT_SECURITY_POLICY);
  const [isEditingPolicy, setIsEditingPolicy] = useState<boolean>(false);
  // Honest initial state (QM-SCREEN-013 P2): nothing is "enforced" until the
  // real GET /:id/branch-protection endpoint below says so. An empty rule set
  // renders as "not set" — never pre-checked.
  const [branchRules, setBranchRules] = useState<BranchSecurityRules>({
    requirePullRequestReviews: false,
    requireStatusChecks: false,
    dismissStaleApprovals: false,
    requireCleanSecretScanning: false,
  });
  const [branchRulesConfigured, setBranchRulesConfigured] = useState(false);
  const [branchRulesLoading, setBranchRulesLoading] = useState(false);
  const [isSavingBranchRules, setIsSavingBranchRules] = useState<boolean>(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);
  const protectionBranch = selectedRepo?.defaultBranch || 'main';

  // Read the real branch-protection rows. Only a rule whose branchPattern
  // matches this repo's default branch counts — anything else is "not set".
  useEffect(() => {
    const target = repoId || selectedRepo?.id;
    if (!target) {
      setBranchRules({
        requirePullRequestReviews: false,
        requireStatusChecks: false,
        dismissStaleApprovals: false,
        requireCleanSecretScanning: false,
      });
      setBranchRulesConfigured(false);
      setBranchRulesLoading(false);
      return;
    }
    let cancelled = false;
    setBranchRulesLoading(true);
    apiFetchRaw(`/api/repos/${encodeURIComponent(target)}/branch-protection`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setBranchRulesConfigured(false);
          return;
        }
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: Array<{
            branchPattern?: string;
            requiredApprovals?: number;
            requireStatusChecks?: boolean;
            dismissStaleApprovals?: boolean;
          }>;
        } | null;
        const rule = Array.isArray(json?.data)
          ? json.data.find((r) => r?.branchPattern === protectionBranch)
          : undefined;
        if (rule) {
          setBranchRules({
            requirePullRequestReviews: (rule.requiredApprovals ?? 0) > 0,
            requireStatusChecks: !!rule.requireStatusChecks,
            dismissStaleApprovals: !!rule.dismissStaleApprovals,
            // The branch-protection API has no secret-scanning field, so this
            // row can never be "configured" from the backend. It stays off and
            // disabled below with an honest note.
            requireCleanSecretScanning: false,
          });
          setBranchRulesConfigured(true);
        } else {
          setBranchRules({
            requirePullRequestReviews: false,
            requireStatusChecks: false,
            dismissStaleApprovals: false,
            requireCleanSecretScanning: false,
          });
          setBranchRulesConfigured(false);
        }
      })
      .catch(() => {
        if (!cancelled) setBranchRulesConfigured(false);
      })
      .finally(() => {
        if (!cancelled) setBranchRulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, selectedRepo?.id, protectionBranch]);

  // --------------------------------------------------------------------------
  // Dependabot Calculations & Filtering
  // --------------------------------------------------------------------------
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
    dependabotAlerts.forEach((a) => {
      if (a.state === 'open') {
        counts[a.severity] = (counts[a.severity] || 0) + 1;
      }
    });
    return counts;
  }, [dependabotAlerts]);

  const filteredDependabotAlerts = useMemo(() => {
    return dependabotAlerts.filter((alert) => {
      // Severity filter
      if (selectedSeverity !== 'all' && alert.severity !== selectedSeverity) {
        return false;
      }
      // State filter
      if (dependabotStateFilter !== 'all') {
        if (dependabotStateFilter === 'open' && alert.state !== 'open') return false;
        if (dependabotStateFilter === 'dismissed' && alert.state !== 'dismissed') return false;
        if (
          dependabotStateFilter === 'closed' &&
          alert.state !== 'closed' &&
          alert.state !== 'resolved'
        )
          return false;
      }
      // Search filter
      if (dependabotSearch.trim()) {
        const query = dependabotSearch.toLowerCase().trim();
        const matchesPackage = alert.package.toLowerCase().includes(query);
        const matchesCve = alert.cve.toLowerCase().includes(query);
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesCwe = (alert.cweTitle || '').toLowerCase().includes(query);
        return matchesPackage || matchesCve || matchesTitle || matchesCwe;
      }
      return true;
    });
  }, [dependabotAlerts, selectedSeverity, dependabotStateFilter, dependabotSearch]);

  const handleCreateFixPR = async (alert: SecurityAlert) => {
    const targetRepo = repoId || selectedRepo?.id;
    if (!targetRepo) {
      showToast('Select a repository before creating a fix PR.');
      return;
    }
    // HONESTY: ask the backend for a REAL fix PR. The endpoint refuses to
    // invent one (501 FIX_PR_NOT_SUPPORTED) until generation is wired up —
    // never fabricate a PR number client-side and never toast a "generated"
    // claim for a PR that does not exist.
    try {
      const res = await apiFetchRaw(
        `/api/repos/${encodeURIComponent(targetRepo)}/security/dependabot/${encodeURIComponent(alert.id)}/fix-pr`,
        { method: 'POST' },
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { prId?: number; message?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.success) {
        showToast(
          json?.error?.message ||
            'Fix PR generation is not available for this repository yet — no PR was created.',
        );
        return;
      }
      const prId = json?.data?.prId;
      if (typeof prId === 'number') {
        setGeneratedFixPrs((prev) => ({ ...prev, [alert.id]: prId }));
        showToast(
          `Fix PR #${prId} opened: bump ${alert.package} to ${alert.patchedVersion || 'patched'}.`,
        );
        // Only a backend-confirmed PR number may notify the parent: the
        // callback must NOT fire on the 501 / failure paths above, where no
        // PR exists (fix/qm-securitytab-fake-pr). A parent that treated the
        // callback as "PR created" would re-introduce the fake-PR claim
        // through the back door.
        if (onCreateFixPR) {
          onCreateFixPR(alert.package, alert.cve, alert.patchedVersion || 'latest');
        }
      } else {
        showToast(json?.data?.message || 'Fix PR request completed with no PR created.');
      }
    } catch {
      showToast('Fix PR generation is not available for this repository yet — no PR was created.');
    }
  };

  const handleDismissDependabot = (alertId: string, reason = 'Risk accepted') => {
    setDependabotAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, state: 'dismissed' as SecurityAlertState, dismissedReason: reason }
          : a,
      ),
    );
    showToast(`Alert dismissed (${reason})`);
  };

  // --------------------------------------------------------------------------
  // Secret Scanning Actions
  // --------------------------------------------------------------------------
  const filteredSecretAlerts = useMemo(() => {
    return secretAlerts.filter((sec) => {
      if (secretStatusFilter !== 'all' && sec.status !== secretStatusFilter) return false;
      if (secretSearch.trim()) {
        const query = secretSearch.toLowerCase().trim();
        return (
          sec.secretType.toLowerCase().includes(query) ||
          sec.filePath.toLowerCase().includes(query) ||
          sec.maskedSecret.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [secretAlerts, secretStatusFilter, secretSearch]);

  // HONESTY (fix/qm-securitytab-revoke-real): the revoke button calls the real
  // backend POST /api/repos/:id/security/secrets/:alertId/revoke. Local state
  // flips to 'revoked' ONLY on confirmed server success, and the success
  // toast fires only then. On failure nothing flips — there is no false state
  // to roll back; the per-alert loading marker is always cleared in `finally`.
  const handleRevokeSecret = async (id: string, secretType: string, filePath: string) => {
    const targetRepo = repoId || selectedRepo?.id;
    if (!targetRepo) {
      showToast('Select a repository before revoking a leaked credential.');
      return;
    }
    if (revokingSecretIds.has(id)) return;
    setRevokingSecretIds((prev) => new Set(prev).add(id));
    try {
      const result = await revokeSecretOnServer(targetRepo, id);
      if (!result.ok) {
        showToast(result.message);
        return;
      }
      setSecretAlerts((prev) =>
        prev.map((sec) =>
          sec.id === id ? { ...sec, status: 'revoked' as SecretAlertStatus } : sec,
        ),
      );
      showToast(result.message || `Revoked leaked credential: ${secretType} at ${filePath}`);
    } finally {
      setRevokingSecretIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // HONESTY (fix/qm-quantgit-falsepositive-endpoint): the false-positive
  // button calls the real backend POST
  // /api/repos/:id/security/secrets/:alertId/false-positive. Local state
  // flips to 'false_positive' ONLY on confirmed server success, and the
  // success toast fires only then. On failure nothing flips — there is no
  // false state to roll back; the per-alert loading marker is always cleared
  // in `finally`.
  const handleMarkFalsePositive = async (id: string, secretType: string) => {
    const targetRepo = repoId || selectedRepo?.id;
    if (!targetRepo) {
      showToast('Select a repository before marking an alert as false positive.');
      return;
    }
    if (markingFalsePositiveIds.has(id)) return;
    setMarkingFalsePositiveIds((prev) => new Set(prev).add(id));
    try {
      const result = await markSecretFalsePositiveOnServer(targetRepo, id);
      if (!result.ok) {
        showToast(result.message);
        return;
      }
      setSecretAlerts((prev) =>
        prev.map((sec) =>
          sec.id === id ? { ...sec, status: 'false_positive' as SecretAlertStatus } : sec,
        ),
      );
      showToast(result.message || `Marked ${secretType} as false positive`);
    } finally {
      setMarkingFalsePositiveIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleTriggerSecretScan = async () => {
    const target = repoId || selectedRepo?.id;
    if (!target) {
      showToast('Select a repository before running a secret scan.');
      return;
    }
    setIsScanningSecrets(true);
    showToast('Running on-demand repository secret scanning…');
    try {
      const res = await apiFetchRaw(`/api/repos/${encodeURIComponent(target)}/security/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanType: 'secrets' }),
      });
      if (!res.ok) {
        showToast('Secret scanning is not available for this repository yet.');
        return;
      }
      // HONESTY: the backend either ran a real scan or tells us it cannot.
      // Never toast invented counts as findings.
      const data = (await res.json().catch(() => null)) as {
        data?: { scanAvailable?: boolean; message?: string };
      } | null;
      const payload = data?.data;
      if (payload && payload.scanAvailable === false) {
        showToast(
          payload.message ||
            'Secret scanning is not wired up for this repository yet — no scan was run.',
        );
      } else if (payload && payload.message) {
        showToast(payload.message);
      } else {
        showToast('Scan request acknowledged. No verified results returned.');
      }
    } catch {
      showToast('Secret scanning is not available for this repository yet.');
    } finally {
      setIsScanningSecrets(false);
    }
  };

  // --------------------------------------------------------------------------
  // CodeQL / SAST Actions
  // --------------------------------------------------------------------------
  const filteredCodeqlAlerts = useMemo(() => {
    return codeqlAlerts.filter((alert) => {
      if (selectedCodeqlSeverity !== 'all' && alert.severity !== selectedCodeqlSeverity)
        return false;
      if (codeqlSearch.trim()) {
        const q = codeqlSearch.toLowerCase().trim();
        return (
          alert.ruleName.toLowerCase().includes(q) ||
          alert.filePath.toLowerCase().includes(q) ||
          alert.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [codeqlAlerts, selectedCodeqlSeverity, codeqlSearch]);

  // HONESTY (fix/qm-quantgit-codeql-toast): the "Apply recommended fix" button
  // calls the real backend POST /api/repos/:id/security/codeql/:alertId/fix.
  // There is no fix engine yet — the endpoint refuses with 501
  // CODEQL_FIX_NOT_SUPPORTED — so the handler toasts the server's honest
  // refusal and NEVER flips local state to 'fixed' on failure. No success
  // toast for a patch that never landed.
  const handleApplyCodeqlFix = async (id: string, ruleName: string) => {
    const targetRepo = repoId || selectedRepo?.id;
    if (!targetRepo) {
      showToast('Select a repository before applying a CodeQL fix.');
      return;
    }
    if (applyingCodeqlIds.has(id)) return;
    setApplyingCodeqlIds((prev) => new Set(prev).add(id));
    try {
      const result = await applyCodeqlFixOnServer(targetRepo, id);
      if (!result.ok) {
        showToast(result.message);
        return;
      }
      setCodeqlAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, state: 'fixed' as const } : a)),
      );
      showToast(result.message || `Applied recommended code patch for ${ruleName}`);
    } finally {
      setApplyingCodeqlIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDismissCodeql = (id: string, ruleName: string) => {
    setCodeqlAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, state: 'dismissed' as const } : a)),
    );
    showToast(`CodeQL alert dismissed for ${ruleName}`);
  };

  // --------------------------------------------------------------------------
  // Policy & Branch Rules Actions
  // --------------------------------------------------------------------------

  // Load the saved SECURITY.md policy (QM-SCREEN-013 P1) plus the server's
  // stored secret-scanning, CodeQL, and Dependabot alert lists from the single
  // GET /:id/security/alerts call (fix/qm-securitytab-alerts-wired, dependabot
  // wired by fix/qm-securitytab-fake-pr). The lists render as stored; when the
  // server truly has none the sub-tabs keep their honest empty state.
  useEffect(() => {
    const target = repoId || selectedRepo?.id;
    if (!target) return;
    let cancelled = false;
    apiFetchRaw(`/api/repos/${encodeURIComponent(target)}/security/alerts`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: SecurityAlertsPayload;
        } | null;
        if (cancelled) return;
        const { policy, dependabot, secrets, codeql } =
          normalizeSecurityAlertsPayload(json?.data);
        if (cancelled) return;
        if (policy !== null) setSecurityPolicy(policy);
        setDependabotAlerts(dependabot);
        setSecretAlerts(secrets);
        setCodeqlAlerts(codeql);
      })
      .catch(() => {
        // Keep the template default and the empty lists — the preview never
        // claims a saved policy or alerts the server did not return.
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, selectedRepo?.id]);

  // Real save (QM-SCREEN-013 P1): persists to POST /:id/security/policy
  // (userId-gated, owner/admin only). Success is toasted only after the
  // backend confirms the write.
  const handleSavePolicy = async () => {
    const target = repoId || selectedRepo?.id;
    if (!target) {
      showToast('Select a repository before saving the security policy.');
      return;
    }
    setIsSavingPolicy(true);
    try {
      const res = await apiFetchRaw(
        `/api/repos/${encodeURIComponent(target)}/security/policy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy: securityPolicy }),
        },
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        showToast(errJson?.error?.message || 'Failed to save the security policy.');
        return;
      }
      setIsEditingPolicy(false);
      showToast('Security policy saved.');
    } catch {
      showToast('Failed to save the security policy.');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // Real save (QM-SCREEN-013 P2): persists to POST /:id/branch-protection.
  // Only the fields the API accepts are sent; the secret-scanning row has no
  // backend field and is never claimed to be saved.
  const handleSaveBranchRules = async () => {
    const target = repoId || selectedRepo?.id;
    if (!target) {
      showToast('Select a repository before saving branch rules.');
      return;
    }
    setIsSavingBranchRules(true);
    try {
      const res = await apiFetchRaw(
        `/api/repos/${encodeURIComponent(target)}/branch-protection`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchPattern: protectionBranch,
            requiredApprovals: branchRules.requirePullRequestReviews ? 1 : 0,
            requireStatusChecks: branchRules.requireStatusChecks,
            dismissStaleApprovals: branchRules.dismissStaleApprovals,
          }),
        },
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        showToast(errJson?.error?.message || 'Failed to save branch protection rules.');
        return;
      }
      setBranchRulesConfigured(true);
      showToast('Branch protection rules saved.');
    } catch {
      showToast('Failed to save branch protection rules.');
    } finally {
      setIsSavingBranchRules(false);
    }
  };

  // Helper badge styles
  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-[#F85149]/20 text-[#F85149] border-[#F85149]/40';
      case 'high':
        return 'bg-[#DB6D28]/20 text-[#DB6D28] border-[#DB6D28]/40';
      case 'moderate':
      case 'medium':
        return 'bg-[#D29922]/20 text-[#D29922] border-[#D29922]/40';
      case 'low':
      default:
        return 'bg-[#58A6FF]/20 text-[#58A6FF] border-[#58A6FF]/40';
    }
  };

  const getCvssBadge = (score?: number) => {
    if (!score) return 'bg-[#7D8590]/20 text-[#7D8590]';
    if (score >= 9.0) return 'bg-[#F85149]/20 text-[#F85149] border-[#F85149]/30';
    if (score >= 7.0) return 'bg-[#DB6D28]/20 text-[#DB6D28] border-[#DB6D28]/30';
    if (score >= 4.0) return 'bg-[#D29922]/20 text-[#D29922] border-[#D29922]/30';
    return 'bg-[#58A6FF]/20 text-[#58A6FF] border-[#58A6FF]/30';
  };

  return (
    <div className="space-y-5 text-xs text-[#E6EDF3]" data-testid="security-tab">
      {/* 1. Header Overview Banner */}
      <div className="p-4 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#238636]/20 text-[#3FB950] font-bold text-sm">🛡️</span>
            <h2 className="font-bold text-white text-base">Security & Vulnerability Overview</h2>
          </div>
          <p className="text-[#7D8590] text-xs">
            Dependabot advisories, secret scanning, and SAST findings appear here once the
            scanners are wired up. Branch protection gates are configurable below.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="open-alerts-count"
            className="px-3 py-1 rounded-full bg-[#E3B341]/20 text-[#E3B341] font-bold text-xs border border-[#E3B341]/30"
          >
            {dependabotAlerts.filter((s) => s.state === 'open').length} Open Dependabot Alerts
          </span>
          <span
            data-testid="active-secrets-count"
            className="px-3 py-1 rounded-full bg-[#F85149]/20 text-[#F85149] font-bold text-xs border border-[#F85149]/30"
          >
            {secretAlerts.filter((s) => s.status === 'active').length} Leaked Secrets
          </span>
        </div>
      </div>

      {/* 2. Sub-Tabs Navigation Bar */}
      <div
 className="flex items-center gap-1 pb-0 overflow-x-auto"
        data-testid="security-subtabs"
      >
        <button
          type="button"
          data-testid="subtab-dependabot"
          onClick={() => setActiveSubTab('dependabot')}
          className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'dependabot'
              ? 'border-[#F78166] text-white bg-[var(--quant-surface-elevated)]/50'
              : 'border-transparent text-[#7D8590] hover:text-[#C9D1D9] hover:bg-[var(--quant-surface-elevated)]/20'
          }`}
        >
          <span>📦 Dependabot alerts</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#21262D] text-[10px] text-[#C9D1D9]">
            {dependabotAlerts.filter((a) => a.state === 'open').length}
          </span>
        </button>

        <button
          type="button"
          data-testid="subtab-secrets"
          onClick={() => setActiveSubTab('secrets')}
          className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'secrets'
              ? 'border-[#F78166] text-white bg-[var(--quant-surface-elevated)]/50'
              : 'border-transparent text-[#7D8590] hover:text-[#C9D1D9] hover:bg-[var(--quant-surface-elevated)]/20'
          }`}
        >
          <span>🔑 Secret scanning</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#21262D] text-[10px] text-[#C9D1D9]">
            {secretAlerts.filter((s) => s.status === 'active').length}
          </span>
        </button>

        <button
          type="button"
          data-testid="subtab-codeql"
          onClick={() => setActiveSubTab('codeql')}
          className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'codeql'
              ? 'border-[#F78166] text-white bg-[var(--quant-surface-elevated)]/50'
              : 'border-transparent text-[#7D8590] hover:text-[#C9D1D9] hover:bg-[var(--quant-surface-elevated)]/20'
          }`}
        >
          <span>🔬 CodeQL / SAST Code scanning</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#21262D] text-[10px] text-[#C9D1D9]">
            {codeqlAlerts.filter((c) => c.state === 'open').length}
          </span>
        </button>

        <button
          type="button"
          data-testid="subtab-policy"
          onClick={() => setActiveSubTab('policy')}
          className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'policy'
              ? 'border-[#F78166] text-white bg-[var(--quant-surface-elevated)]/50'
              : 'border-transparent text-[#7D8590] hover:text-[#C9D1D9] hover:bg-[var(--quant-surface-elevated)]/20'
          }`}
        >
          <span>📜 Security policy & Branch rules</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: DEPENDABOT ALERTS                                         */}
      {/* ==================================================================== */}
      {activeSubTab === 'dependabot' && (
        <div className="space-y-4" data-testid="dependabot-alerts-view">
          {/* Severity summary pills */}
          <div className="flex flex-wrap items-center gap-2" data-testid="severity-pills">
            <button
              type="button"
              data-testid="severity-pill-all"
              onClick={() => setSelectedSeverity('all')}
              className={`px-3 py-1.5 rounded-full font-semibold border transition-all ${
                selectedSeverity === 'all'
                  ? 'bg-[#30363D] text-white border-[#58A6FF]'
                  : 'bg-[var(--quant-surface-elevated)] text-[#7D8590] border-[#30363D] hover:text-[#C9D1D9]'
              }`}
            >
              All Severities ({dependabotAlerts.length})
            </button>

            <button
              type="button"
              data-testid="severity-pill-critical"
              onClick={() =>
                setSelectedSeverity(selectedSeverity === 'critical' ? 'all' : 'critical')
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold border transition-all ${
                selectedSeverity === 'critical'
                  ? 'bg-[#F85149] text-white border-[#F85149]'
                  : 'bg-[#F85149]/15 text-[#F85149] border-[#F85149]/30 hover:bg-[#F85149]/25'
              }`}
            >
              <span>Critical</span>
              <span className="px-1.5 py-px rounded-full bg-black/40 text-[10px]">
                {severityCounts.critical}
              </span>
            </button>

            <button
              type="button"
              data-testid="severity-pill-high"
              onClick={() => setSelectedSeverity(selectedSeverity === 'high' ? 'all' : 'high')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold border transition-all ${
                selectedSeverity === 'high'
                  ? 'bg-[#DB6D28] text-white border-[#DB6D28]'
                  : 'bg-[#DB6D28]/15 text-[#DB6D28] border-[#DB6D28]/30 hover:bg-[#DB6D28]/25'
              }`}
            >
              <span>High</span>
              <span className="px-1.5 py-px rounded-full bg-black/40 text-[10px]">
                {severityCounts.high}
              </span>
            </button>

            <button
              type="button"
              data-testid="severity-pill-moderate"
              onClick={() =>
                setSelectedSeverity(selectedSeverity === 'moderate' ? 'all' : 'moderate')
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold border transition-all ${
                selectedSeverity === 'moderate'
                  ? 'bg-[#D29922] text-white border-[#D29922]'
                  : 'bg-[#D29922]/15 text-[#D29922] border-[#D29922]/30 hover:bg-[#D29922]/25'
              }`}
            >
              <span>Moderate</span>
              <span className="px-1.5 py-px rounded-full bg-black/40 text-[10px]">
                {severityCounts.moderate}
              </span>
            </button>

            <button
              type="button"
              data-testid="severity-pill-low"
              onClick={() => setSelectedSeverity(selectedSeverity === 'low' ? 'all' : 'low')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold border transition-all ${
                selectedSeverity === 'low'
                  ? 'bg-[#58A6FF] text-white border-[#58A6FF]'
                  : 'bg-[#58A6FF]/15 text-[#58A6FF] border-[#58A6FF]/30 hover:bg-[#58A6FF]/25'
              }`}
            >
              <span>Low</span>
              <span className="px-1.5 py-px rounded-full bg-black/40 text-[10px]">
                {severityCounts.low}
              </span>
            </button>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D]">
            <div className="flex items-center gap-2">
              <span className="text-[#7D8590] font-semibold">State:</span>
              <div className="flex items-center rounded bg-[#0D1117] border border-[#30363D] p-0.5">
                {(['open', 'dismissed', 'closed', 'all'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-testid={`state-filter-${st}`}
                    onClick={() => setDependabotStateFilter(st)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                      dependabotStateFilter === st
                        ? 'bg-[#21262D] text-white shadow-sm'
                        : 'text-[#7D8590] hover:text-[#C9D1D9]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 max-w-md">
              <input
                type="text"
                data-testid="dependabot-search-input"
                placeholder="Search by package, CVE (e.g. CVE-2026-3849), or title..."
                value={dependabotSearch}
                onChange={(e) => setDependabotSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#0D1117] border border-[#30363D] text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] text-xs"
              />
            </div>
          </div>

          {/* Detailed Advisory Cards List */}
          <div
 className="border border-[#30363D] rounded-md bg-[#0D1117]"
            data-testid="dependabot-advisories-list"
          >
            {filteredDependabotAlerts.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-[#7D8590]">
                <p className="text-sm font-semibold text-[#C9D1D9]">
                  No Dependabot alerts match your criteria
                </p>
                <p className="text-xs">
                  Adjust severity filter or search keywords to view other advisories.
                </p>
              </div>
            ) : (
              filteredDependabotAlerts.map((sec) => (
                <div
                  key={sec.id}
                  data-testid={`dependabot-card-${sec.id}`}
                  className="p-4 hover:bg-[var(--quant-surface-elevated)]/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    {/* Top Row: Severity, Package Name, CVE, CVSS */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid={`severity-badge-${sec.severity}`}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getSeverityBadge(
                          sec.severity,
                        )}`}
                      >
                        {sec.severity}
                      </span>

                      <span className="font-bold text-white text-sm font-mono">{sec.package}</span>

                      <span
                        data-testid={`cve-id-${sec.cve}`}
                        className="font-mono text-[#58A6FF] font-semibold px-2 py-0.5 rounded bg-[#58A6FF]/10 border border-[#58A6FF]/20"
                      >
                        {sec.cve}
                      </span>

                      {sec.cvss !== undefined && (
                        <span
                          data-testid={`cvss-score-${sec.id}`}
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${getCvssBadge(
                            sec.cvss,
                          )}`}
                        >
                          CVSS {sec.cvss.toFixed(1)}
                        </span>
                      )}

                      {sec.state === 'dismissed' && (
                        <span className="px-2 py-0.5 rounded bg-[#7D8590]/20 text-[#7D8590] text-[10px] font-semibold">
                          Dismissed ({sec.dismissedReason || 'Risk accepted'})
                        </span>
                      )}

                      {sec.state === 'closed' && (
                        <span className="px-2 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] text-[10px] font-semibold">
                          Closed / Resolved
                        </span>
                      )}
                    </div>

                    {/* Title & CWE */}
                    <div className="space-y-0.5">
                      <h4 className="text-white font-medium text-xs">{sec.title}</h4>
                      {sec.cweTitle && (
                        <p className="text-[11px] text-[#A5D6FF] font-mono">{sec.cweTitle}</p>
                      )}
                    </div>

                    {/* Version Ranges */}
                    <div className="flex items-center gap-4 text-[11px] text-[#7D8590]">
                      <span>
                        Vulnerable version:{' '}
                        <code className="text-[#F85149] font-mono bg-[#F85149]/10 px-1 py-px rounded">
                          {sec.vulnerableRange || '< patched'}
                        </code>
                      </span>
                      <span>
                        Patched version:{' '}
                        <code className="text-[#3FB950] font-mono bg-[#3FB950]/10 px-1 py-px rounded">
                          {sec.patchedVersion || 'latest'}
                        </code>
                      </span>
                      {sec.createdAt && <span>Detected {sec.createdAt}</span>}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 shrink-0">
                    {generatedFixPrs[sec.id] ? (
                      <span
                        data-testid={`pr-created-${sec.id}`}
                        className="px-3 py-1.5 rounded bg-[#238636]/20 border border-[#238636]/40 text-[#3FB950] font-semibold text-xs flex items-center gap-1.5"
                      >
                        <span>✓</span>
                        <span>PR #{generatedFixPrs[sec.id]} opened</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`create-fix-pr-${sec.id}`}
                        onClick={() => handleCreateFixPR(sec)}
                        className="px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <span>🤖</span>
                        <span>Create fix PR</span>
                      </button>
                    )}

                    {sec.state === 'open' && (
                      <button
                        type="button"
                        data-testid={`dismiss-alert-${sec.id}`}
                        onClick={() => handleDismissDependabot(sec.id)}
                        className="px-3 py-1.5 rounded bg-[#21262D] border border-[#30363D] text-[#7D8590] hover:text-white font-semibold text-xs hover:bg-[#30363D] transition-colors"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: SECRET SCANNING                                           */}
      {/* ==================================================================== */}
      {activeSubTab === 'secrets' && (
        <div className="space-y-4" data-testid="secret-scanning-view">
          {/* Header Action Bar */}
          <div className="p-4 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🔑 Git Credential & Secret Scanner</span>
                <span
                  data-testid="secret-scanner-badge"
                  className="px-2 py-px rounded-full bg-[#7D8590]/20 text-[#7D8590] font-mono text-[10px]"
                >
                  {secretAlerts.length > 0 ? 'Stored findings' : 'Not wired up'}
                </span>
              </h3>
              <p className="text-[#7D8590] text-xs">
                {secretAlerts.length > 0
                  ? 'No live scan engine is wired up yet — these are the findings stored on the server.'
                  : 'Secret scanning is not wired up yet — nothing is being scanned. Findings from a future scan will appear here.'}
              </p>
            </div>

            <button
              type="button"
              data-testid="trigger-secret-scan-btn"
              disabled={isScanningSecrets}
              onClick={handleTriggerSecretScan}
              className="px-3.5 py-1.5 rounded bg-[#21262D] border border-[#30363D] text-[#58A6FF] hover:bg-[#30363D] font-semibold text-xs transition-colors flex items-center gap-2"
            >
              {isScanningSecrets ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Scanning repository...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Scan repository now</span>
                </>
              )}
            </button>
          </div>

          {/* Secret Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D]">
            <div className="flex items-center gap-2">
              <span className="text-[#7D8590] font-semibold">Status:</span>
              <div className="flex items-center rounded bg-[#0D1117] border border-[#30363D] p-0.5">
                {(['all', 'active', 'revoked', 'false_positive'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-testid={`secret-filter-${st}`}
                    onClick={() => setSecretStatusFilter(st)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                      secretStatusFilter === st
                        ? 'bg-[#21262D] text-white shadow-sm'
                        : 'text-[#7D8590] hover:text-[#C9D1D9]'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 max-w-md">
              <input
                type="text"
                data-testid="secret-search-input"
                placeholder="Search secrets by type, file path (e.g. .env), or token..."
                value={secretSearch}
                onChange={(e) => setSecretSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#0D1117] border border-[#30363D] text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] text-xs"
              />
            </div>
          </div>

          {/* Secret Alerts List */}
          <div
 className="border border-[#30363D] rounded-md bg-[#0D1117]"
            data-testid="secret-alerts-list"
          >
            {filteredSecretAlerts.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-[#7D8590]">
                <p className="text-sm font-semibold text-[#7D8590]">Secret scanning isn&apos;t wired up yet</p>
                <p className="text-xs">
                  No scan has run, so there are no findings to show.
                </p>
              </div>
            ) : (
              filteredSecretAlerts.map((sec) => (
                <div
                  key={sec.id}
                  data-testid={`secret-card-${sec.id}`}
                  className="p-4 hover:bg-[var(--quant-surface-elevated)]/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-sm">{sec.secretType}</span>

                      <span
                        data-testid={`secret-status-badge-${sec.id}`}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          sec.status === 'active'
                            ? 'bg-[#F85149]/20 text-[#F85149] border-[#F85149]/40'
                            : sec.status === 'revoked'
                              ? 'bg-[#3FB950]/20 text-[#3FB950] border-[#3FB950]/40'
                              : 'bg-[#7D8590]/20 text-[#7D8590] border-[#7D8590]/40'
                        }`}
                      >
                        {sec.status.replace('_', ' ')}
                      </span>

                      <span className="text-[#7D8590] text-[11px]">Detected {sec.detectedAt}</span>
                    </div>

                    {/* Matched Snippet (Masked) */}
                    <div className="font-mono text-xs text-[#E6EDF3] bg-[var(--quant-surface-elevated)] px-3 py-1.5 rounded border border-[#30363D] inline-block">
                      <span className="text-[#7D8590] mr-2">Token:</span>
                      <span
                        data-testid={`masked-secret-${sec.id}`}
                        className="text-[#FFA657] font-semibold"
                      >
                        {sec.maskedSecret}
                      </span>
                    </div>

                    {/* File Path & Line */}
                    <div className="text-[11px] text-[#7D8590] flex items-center gap-2">
                      <span>Location:</span>
                      <code
                        data-testid={`secret-location-${sec.id}`}
                        className="text-[#58A6FF] font-mono hover:underline cursor-pointer"
                      >
                        {sec.filePath}:{sec.lineNumber}
                      </code>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {sec.status === 'active' && (
                      <button
                        type="button"
                        data-testid={`revoke-token-btn-${sec.id}`}
                        onClick={() => handleRevokeSecret(sec.id, sec.secretType, sec.filePath)}
                        disabled={revokingSecretIds.has(sec.id)}
                        aria-live="polite"
                        className="px-3 py-1.5 rounded bg-[#F85149]/20 hover:bg-[#F85149]/30 text-[#F85149] border border-[#F85149]/40 font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-wait disabled:hover:bg-[#F85149]/20"
                      >
                        {revokingSecretIds.has(sec.id) ? 'Revoking…' : 'Revoke token'}
                      </button>
                    )}

                    {sec.status !== 'false_positive' && (
                      <button
                        type="button"
                        data-testid={`false-positive-btn-${sec.id}`}
                        onClick={() => handleMarkFalsePositive(sec.id, sec.secretType)}
                        disabled={markingFalsePositiveIds.has(sec.id)}
                        aria-live="polite"
                        className="px-3 py-1.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#7D8590] hover:text-white border border-[#30363D] font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-wait disabled:hover:bg-[#21262D]"
                      >
                        {markingFalsePositiveIds.has(sec.id) ? 'Marking…' : 'Mark false positive'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: CODEQL / SAST CODE SCANNING                                */}
      {/* ==================================================================== */}
      {activeSubTab === 'codeql' && (
        <div className="space-y-4" data-testid="codeql-sast-view">
          {/* Header Banner */}
          <div className="p-4 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>🔬 CodeQL Static Application Security Testing (SAST)</span>
                <span
                  data-testid="codeql-scanner-badge"
                  className="px-2 py-px rounded-full bg-[#7D8590]/20 text-[#7D8590] font-mono text-[10px]"
                >
                  {codeqlAlerts.length > 0 ? 'Stored findings' : 'Not wired up'}
                </span>
              </h3>
              <p className="text-[#7D8590] text-xs">
                {codeqlAlerts.length > 0
                  ? 'No live scan engine is wired up yet — these are the findings stored on the server.'
                  : 'SAST scanning is not wired up yet — nothing is being analyzed. Findings from a future scan will appear here.'}
              </p>
            </div>

            <div className="text-right text-[11px] text-[#7D8590]">
              <div>
                Engine: <span className="text-[#7D8590] font-semibold">Not connected</span>
              </div>
              <div>
                Rule suites: <span className="text-white">—</span>
              </div>
            </div>
          </div>

          {/* CodeQL Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D]">
            <div className="flex items-center gap-2">
              <span className="text-[#7D8590] font-semibold">Severity:</span>
              <div className="flex items-center rounded bg-[#0D1117] border border-[#30363D] p-0.5">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    data-testid={`codeql-filter-${sev}`}
                    onClick={() => setSelectedCodeqlSeverity(sev)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                      selectedCodeqlSeverity === sev
                        ? 'bg-[#21262D] text-white shadow-sm'
                        : 'text-[#7D8590] hover:text-[#C9D1D9]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 max-w-md">
              <input
                type="text"
                data-testid="codeql-search-input"
                placeholder="Search rule name (e.g. SQL Injection), file path, or CWE..."
                value={codeqlSearch}
                onChange={(e) => setCodeqlSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#0D1117] border border-[#30363D] text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] text-xs"
              />
            </div>
          </div>

          {/* SAST Alerts List */}
          <div
 className="border border-[#30363D] rounded-md bg-[#0D1117]"
            data-testid="codeql-alerts-list"
          >
            {filteredCodeqlAlerts.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-[#7D8590]">
                <p className="text-sm font-semibold text-[#7D8590]">
                  SAST scanning isn&apos;t wired up yet
                </p>
                <p className="text-xs">No scan has run, so there are no findings to show.</p>
              </div>
            ) : (
              filteredCodeqlAlerts.map((alert) => (
                <div
                  key={alert.id}
                  data-testid={`codeql-card-${alert.id}`}
                  className="p-5 hover:bg-[var(--quant-surface-elevated)]/50 transition-colors space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`codeql-severity-${alert.id}`}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getSeverityBadge(
                          alert.severity,
                        )}`}
                      >
                        {alert.severity}
                      </span>
                      <h4 className="font-bold text-white text-sm">{alert.ruleName}</h4>
                      <span className="font-mono text-[11px] text-[#7D8590]">({alert.ruleId})</span>
                      {alert.state === 'fixed' && (
                        <span className="px-2 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] text-[10px] font-semibold">
                          ✓ Fix Applied
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {alert.state === 'open' && (
                        <>
                          <button
                            type="button"
                            data-testid={`codeql-apply-fix-${alert.id}`}
                            onClick={() => handleApplyCodeqlFix(alert.id, alert.ruleName)}
                            disabled={applyingCodeqlIds.has(alert.id)}
                            className="px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs transition-colors disabled:opacity-60"
                          >
                            {applyingCodeqlIds.has(alert.id) ? 'Applying…' : 'Apply recommended fix'}
                          </button>
                          <button
                            type="button"
                            data-testid={`codeql-dismiss-${alert.id}`}
                            onClick={() => handleDismissCodeql(alert.id, alert.ruleName)}
                            className="px-3 py-1.5 rounded bg-[#21262D] border border-[#30363D] text-[#7D8590] hover:text-white font-semibold text-xs hover:bg-[#30363D]"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#C9D1D9]">{alert.description}</p>

                  <div className="text-[11px] text-[#7D8590] flex items-center gap-1 font-mono">
                    <span>File:</span>
                    <span data-testid={`codeql-location-${alert.id}`} className="text-[#58A6FF]">
                      {alert.filePath}:{alert.lineStart}-{alert.lineEnd}
                    </span>
                  </div>

                  {/* Recommended Code Fix Diff */}
                  <div
                    data-testid={`codeql-diff-${alert.id}`}
                    className="rounded bg-[var(--quant-surface-elevated)] border border-[#30363D] overflow-hidden font-mono text-[11px]"
                  >
 <div className="px-3 py-1.5 bg-[#21262D] text-[#7D8590] font-semibold text-[10px] flex items-center justify-between">
                      <span>Recommended Code Fix Diff</span>
                      <span className="text-[#3FB950] font-normal">Automated Patch Ready</span>
                    </div>

                    {/* Vulnerable code (red) */}
 <div className="px-3 py-2 bg-[#F85149]/10 text-[#F85149] flex items-start gap-2">
                      <span className="font-bold select-none">-</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap">{alert.codeSnippet}</pre>
                    </div>

                    {/* Recommended fix (green) */}
                    <div className="px-3 py-2 bg-[#238636]/10 text-[#3FB950] flex items-start gap-2">
                      <span className="font-bold select-none">+</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap">
                        {alert.recommendedFix}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 4: SECURITY POLICY & BRANCH RULES                             */}
      {/* ==================================================================== */}
      {activeSubTab === 'policy' && (
        <div className="space-y-6" data-testid="security-policy-view">
          {/* Section 1: SECURITY.md Editor & Viewer */}
          <div className="space-y-3 p-5 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>📜 Repository Security Policy (SECURITY.md)</span>
                </h3>
                <p className="text-[#7D8590] text-xs mt-0.5">
                  Provides public instructions on how to disclose vulnerabilities securely to your
                  project team.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="toggle-edit-policy-btn"
                  onClick={() => setIsEditingPolicy(!isEditingPolicy)}
                  className="px-3 py-1.5 rounded bg-[#21262D] border border-[#30363D] text-[#58A6FF] font-semibold text-xs hover:bg-[#30363D]"
                >
                  {isEditingPolicy ? 'Preview policy' : 'Edit SECURITY.md'}
                </button>

                {isEditingPolicy && (
                  <button
                    type="button"
                    data-testid="save-policy-btn"
                    onClick={handleSavePolicy}
                    disabled={isSavingPolicy}
                    className="px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs"
                  >
                    {isSavingPolicy ? 'Saving…' : 'Save policy'}
                  </button>
                )}
              </div>
            </div>

            {isEditingPolicy ? (
              <textarea
                aria-label="Security policy"
                data-testid="security-policy-textarea"
                rows={12}
                value={securityPolicy}
                onChange={(e) => setSecurityPolicy(e.target.value)}
                className="w-full p-3 font-mono text-xs rounded bg-[#0D1117] border border-[#30363D] text-white focus:outline-none focus:border-[#58A6FF]"
              />
            ) : (
              <div
                data-testid="security-policy-preview"
                className="p-4 rounded bg-[#0D1117] border border-[#30363D] whitespace-pre-wrap font-sans text-xs text-[#C9D1D9] leading-relaxed"
              >
                {securityPolicy}
              </div>
            )}
          </div>

          {/* Section 2: Branch Protection Security Rules */}
          <div
            className="space-y-4 p-5 rounded-md bg-[var(--quant-surface-elevated)] border border-[#30363D]"
            data-testid="branch-protection-rules-view"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>🔒 Branch Protection Security Checks</span>
                  <span
                    data-testid="branch-rules-enforced-badge"
                    className={`px-2 py-px rounded-full font-mono text-[10px] font-bold ${
                      branchRulesConfigured &&
                      (branchRules.requirePullRequestReviews ||
                        branchRules.requireStatusChecks ||
                        branchRules.dismissStaleApprovals)
                        ? 'bg-[#238636]/20 text-[#3FB950]'
                        : 'bg-[#8B949E]/20 text-[#8B949E]'
                    }`}
                  >
                    {branchRulesLoading
                      ? 'Loading…'
                      : !branchRulesConfigured
                        ? `${protectionBranch}: Not set`
                        : branchRules.requirePullRequestReviews ||
                            branchRules.requireStatusChecks ||
                            branchRules.dismissStaleApprovals
                          ? `${protectionBranch}: Enforced`
                          : `${protectionBranch}: Not enforced`}
                  </span>
                </h3>
                <p className="text-[#7D8590] text-xs mt-0.5">
                  Protect branches from unreviewed commits, failing security checks, or leaked
                  credentials.
                </p>
                {!branchRulesLoading && !branchRulesConfigured && (
                  <p
                    data-testid="branch-rules-not-set-note"
                    className="text-[#7D8590] text-xs mt-0.5"
                  >
                    No branch protection rules are configured for this branch yet.
                  </p>
                )}
              </div>

              <button
                type="button"
                data-testid="save-branch-rules-btn"
                disabled={isSavingBranchRules}
                onClick={handleSaveBranchRules}
                className="px-3.5 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs transition-colors"
              >
                {isSavingBranchRules ? 'Saving...' : 'Save branch rules'}
              </button>
            </div>

 <div className="space-y-3 pt-2">
              {/* Check 1: Require pull request reviews before merging */}
              <label
                data-testid="rule-require-pr-reviews"
                className="flex items-start gap-3 pt-3 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  data-testid="checkbox-require-pr-reviews"
                  checked={branchRules.requirePullRequestReviews}
                  onChange={(e) =>
                    setBranchRules((prev) => ({
                      ...prev,
                      requirePullRequestReviews: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-[#30363D] bg-[#0D1117] text-[#58A6FF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-white group-hover:text-[#58A6FF] transition-colors">
                    Require pull request reviews before merging
                  </span>
                  <p className="text-[11px] text-[#7D8590]">
                    When enabled, all commits must be made to a non-protected branch and submitted
                    via a pull request with at least 1 approved review.
                  </p>
                </div>
              </label>

              {/* Check 2: Require status checks to pass before merging */}
              <label
                data-testid="rule-require-status-checks"
                className="flex items-start gap-3 pt-3 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  data-testid="checkbox-require-status-checks"
                  checked={branchRules.requireStatusChecks}
                  onChange={(e) =>
                    setBranchRules((prev) => ({
                      ...prev,
                      requireStatusChecks: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-[#30363D] bg-[#0D1117] text-[#58A6FF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-white group-hover:text-[#58A6FF] transition-colors">
                    Require status checks to pass before merging
                  </span>
                  <p className="text-[11px] text-[#7D8590]">
                    Choose which status checks must pass before branches can be merged. Enforces
                    CodeQL SAST and Vitest test suites to pass 100% green.
                  </p>
                </div>
              </label>

              {/* Check 3: Dismiss stale pull request approvals when new commits are pushed */}
              <label
                data-testid="rule-dismiss-stale-approvals"
                className="flex items-start gap-3 pt-3 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  data-testid="checkbox-dismiss-stale-approvals"
                  checked={branchRules.dismissStaleApprovals}
                  onChange={(e) =>
                    setBranchRules((prev) => ({
                      ...prev,
                      dismissStaleApprovals: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-[#30363D] bg-[#0D1117] text-[#58A6FF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-white group-hover:text-[#58A6FF] transition-colors">
                    Dismiss stale pull request approvals when new commits are pushed
                  </span>
                  <p className="text-[11px] text-[#7D8590]">
                    When enabled, pushing new commits to a pull request dismisses existing
                    approvals — the pull request cannot merge until it is re-reviewed.
                  </p>
                </div>
              </label>

              {/* Check 4: Require secret scanning to be clean before merge.
                  The branch-protection API has no field for this rule, so it
                  cannot be persisted or enforced — it stays disabled with an
                  honest note rather than pretending to save. */}
              <label
                data-testid="rule-require-clean-secrets"
                className="flex items-start gap-3 pt-3 cursor-not-allowed group opacity-70"
                aria-disabled="true"
              >
                <input
                  type="checkbox"
                  data-testid="checkbox-require-clean-secrets"
                  checked={false}
                  disabled
                  onChange={() => {}}
                  className="mt-0.5 rounded border-[#30363D] bg-[#0D1117] text-[#58A6FF] focus:ring-0 focus:ring-offset-0 cursor-not-allowed"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-white group-hover:text-[#58A6FF] transition-colors">
                    Require secret scanning to be clean before merge
                  </span>
                  <p className="text-[11px] text-[#7D8590]">
                    Blocks merging pull requests if any new active credentials (AWS keys, OpenAI
                    tokens, database URIs, RSA keys) are detected in the diff.
                  </p>
                  <p className="text-[11px] text-[#7D8590] italic">
                    Not yet supported by the branch-protection API — cannot be enforced yet.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
