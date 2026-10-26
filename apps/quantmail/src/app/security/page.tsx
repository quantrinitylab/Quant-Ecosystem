'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Input, FormField, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { IconCheck } from '../../components/icons';
import { TwoFactorQrCode } from '../../components/security/TwoFactorQrCode';
import { showToast } from '../../components/InboxToast';
import { browserAuthSession } from '../../services/browser-auth-session';
import {
  isPasskeySupported,
  startPasskeyRegistration,
  type PasskeyRegistrationOptionsJSON,
} from '../../lib/passkey-client';
import {
  apiClient,
  type OAuthGrant,
  type PersonalAccessToken,
  type MintedPersonalAccessToken,
} from '../../services/api-client';
import { describeRevokeAvailability } from './session-revoke';

// ---------------------------------------------------------------------------
// Security Tabs — GitHub/Gmail-quality tabbed navigation
// ---------------------------------------------------------------------------
type SecurityTab = 'password-auth' | 'sessions' | 'connected-apps' | 'personal-tokens';

const TABS: { key: SecurityTab; label: string }[] = [
  { key: 'password-auth', label: 'Password & Authentication' },
  { key: 'sessions', label: 'Active Sessions' },
  { key: 'connected-apps', label: 'Connected Apps & Integrations' },
  { key: 'personal-tokens', label: 'Personal Access Tokens' },
];

// ---------------------------------------------------------------------------
// OAuth scope descriptions
//
// These are the scopes this backend actually grants (see backend
// /oauth/authorize defaults and the OIDC discovery document): openid, profile,
// email. Descriptions follow what each scope discloses per the code — the
// id_token claims and the /oauth/userinfo response — not marketing copy.
// ---------------------------------------------------------------------------
const OAUTH_SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Sign you in — proves your identity to the app',
  profile: 'Basic profile — your name and username',
  email: 'Your email address',
};

const describeOAuthScope = (scope: string): string =>
  OAUTH_SCOPE_DESCRIPTIONS[scope] ?? scope;

// ---------------------------------------------------------------------------
// Personal access token scopes
//
// The backend mints tokens only for these scopes
// (backend/routes/settings-tokens.ts). Offered verbatim — nothing else exists.
// Scope semantics on the backend (modules/code/routes/git-transport.ts):
// repo:admin is a superset — it satisfies both repo:read and repo:write
// checks, so a token minted with only repo:admin can clone and push.
// ---------------------------------------------------------------------------
const PAT_SCOPES = [
  { value: 'repo:read', label: 'repo:read', description: 'Read repositories' },
  { value: 'repo:write', label: 'repo:write', description: 'Read and write repositories' },
  { value: 'repo:admin', label: 'repo:admin', description: 'Full access — reads and writes your repositories' },
] as const;

const PAT_EXPIRIES = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
] as const;

// ---------------------------------------------------------------------------
// Two-factor authentication
//
// This section used to lie. `Enable 2FA` was offered unconditionally because
// nothing ever asked the server what was already true, the QR came from
// `api.qrserver.com` — handed the URI that carries the shared secret — and the
// recovery codes were printed before any code had been verified, for a factor
// that might never be switched on. All three are gone.
// ---------------------------------------------------------------------------

interface TwoFactorStatus {
  enabled: boolean;
  pendingSetup: boolean;
  confirmedAt: string | null;
  backupCodesRemaining: number;
}

/** Below this, the card says so — running out silently is how people lock up. */
const RECOVERY_CODES_LOW = 3;

/** Base32 in groups of four: the difference between typing it and giving up. */
const groupSecret = (secret: string): string => secret.replace(/(.{4})/g, '$1 ').trim();

const formatConfirmedAt = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const statusSummary = (status: TwoFactorStatus): string => {
  const since = status.confirmedAt ? `On since ${formatConfirmedAt(status.confirmedAt)}. ` : '';
  const left = status.backupCodesRemaining;
  return `${since}${left} recovery ${left === 1 ? 'code' : 'codes'} left.`;
};

// ---------------------------------------------------------------------------
// Active Sessions (QM-SCREEN-016)
//
// This tab used to be theatrical: a hard-coded "Current session" row, an
// "Only this device is active" empty state, and a permanently disabled Revoke
// All — no session list was ever fetched. Now it reads GET /auth/sessions, so
// every row on screen is a real refresh-token family.
// ---------------------------------------------------------------------------

interface ActiveSession {
  id: string;
  isCurrent: boolean;
  firstSeenAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

/**
 * A device label from a User-Agent string, without inventing anything.
 * Returns null when the UA is missing or unrecognizable — the UI then says
 * the device was not recorded instead of showing a made-up name. Order
 * matters: Edge and Opera UAs contain a Chrome token, and Chrome's contains
 * a Safari token.
 */
function deviceLabelFromUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows NT/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const formatDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown';

/** Group grants by scope so the permission summary is derived from real data. */
function groupGrantsByScope(grants: OAuthGrant[]): { scope: string; clientNames: string[] }[] {
  const map = new Map<string, string[]>();
  for (const grant of grants) {
    for (const scope of grant.scopes) {
      const names = map.get(scope);
      if (names) {
        if (!names.includes(grant.clientName)) names.push(grant.clientName);
      } else {
        map.set(scope, [grant.clientName]);
      }
    }
  }
  return [...map.entries()].map(([scope, clientNames]) => ({ scope, clientNames }));
}

type PersonalAccessTokenStatus = 'active' | 'expired' | 'revoked';

const personalAccessTokenStatus = (token: PersonalAccessToken): PersonalAccessTokenStatus => {
  if (token.revokedAt) return 'revoked';
  if (new Date(token.expiresAt).getTime() < Date.now()) return 'expired';
  return 'active';
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Insecure context, or permission refused. The codes are on screen and
    // selectable either way, so this is a convenience failing, not a dead end.
    return false;
  }
}

function downloadRecoveryCodes(codes: string[]): void {
  const body = [
    'QuantMail recovery codes',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Each code signs you in once if you lose your authenticator.',
    '',
    ...codes,
    '',
    // CRLF, because the likeliest place this file gets opened is Notepad.
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quantmail-recovery-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<SecurityTab>('password-auth');

  // ─── 2FA State ──────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [enrolment, setEnrolment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [twoFactorNotice, setTwoFactorNotice] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  /**
   * Shown once, and only after the server has proved the authenticator works.
   * `null` is not "no codes" — it is "there is nothing new to show you".
   */
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);
  /** Disable and regenerate both cost the password; neither costs a code. */
  const [passwordPrompt, setPasswordPrompt] = useState<'disable' | 'regenerate' | null>(null);
  const [actionPassword, setActionPassword] = useState('');

  // ─── Password State ─────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [passwordError, setPasswordError] = useState('');

  // ─── Passkeys State ─────────────────────────────────────────────────────────
  // Display metadata only — the server never sends a public key, and the
  // list must never claim a passkey exists that the server did not return.
  interface PasskeyRow {
    id: string;
    name: string | null;
    deviceType: string | null;
    backedUp: boolean;
    transports: string[];
    createdAt: string;
    lastUsedAt: string | null;
  }
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysError, setPasskeysError] = useState('');
  const [passkeysNotice, setPasskeysNotice] = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');

  // ─── Sessions State ─────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [revokingSessions, setRevokingSessions] = useState(false);

  // ─── 2FA Handlers ───────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setStatusError('');
    const response = await apiClient.getTwoFactorStatus();
    if (!response.success || !response.data) {
      setStatusError(response.error?.message || 'Could not read your two-factor settings.');
      return;
    }
    setStatus(response.data);
  }, []);

  // ─── Passkeys Handlers ──────────────────────────────────────────────────────
  const loadPasskeys = useCallback(async () => {
    setPasskeysLoading(true);
    setPasskeysError('');
    const response = await apiClient.getPasskeys();
    setPasskeysLoading(false);
    if (!response.success || !response.data) {
      setPasskeysError(response.error?.message || 'Could not load your passkeys.');
      return;
    }
    setPasskeys(response.data.passkeys);
  }, []);

  const handleAddPasskey = useCallback(async () => {
    if (!isPasskeySupported()) {
      setPasskeysError('This browser cannot create a passkey.');
      return;
    }
    setPasskeyBusy(true);
    setPasskeysError('');
    setPasskeysNotice('');
    try {
      const optionsResponse = await browserAuthSession.passkeyRegisterOptions();
      if (!optionsResponse.success || !optionsResponse.data) {
        throw new Error(optionsResponse.error?.message || 'Could not start passkey setup.');
      }
      const created = await startPasskeyRegistration(
        optionsResponse.data.options as PasskeyRegistrationOptionsJSON,
      );
      const verifyResponse = await browserAuthSession.passkeyRegisterVerify(
        created,
        optionsResponse.data.challengeToken,
        passkeyName.trim() || null,
      );
      if (!verifyResponse.success) {
        throw new Error(verifyResponse.error?.message || 'That passkey could not be verified.');
      }
      setPasskeyName('');
      setPasskeysNotice('Passkey added. You can now sign in with it from the login page.');
      await loadPasskeys();
    } catch (caught) {
      setPasskeysError(caught instanceof Error ? caught.message : 'Could not add a passkey.');
    } finally {
      setPasskeyBusy(false);
    }
  }, [loadPasskeys, passkeyName]);

  const handleDeletePasskey = useCallback(
    async (id: string) => {
      setPasskeyBusy(true);
      setPasskeysError('');
      setPasskeysNotice('');
      const response = await apiClient.deletePasskey(id);
      setPasskeyBusy(false);
      if (!response.success) {
        setPasskeysError(response.error?.message || 'Could not remove that passkey.');
        return;
      }
      setPasskeysNotice('Passkey removed.');
      await loadPasskeys();
    },
    [loadPasskeys],
  );

  useEffect(() => {
    void loadStatus();
    void loadPasskeys();
  }, [loadStatus, loadPasskeys]);

  // ─── Sessions Handlers ──────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError('');
    const response = await apiClient.getSessions();
    setSessionsLoading(false);
    if (!response.success || !response.data) {
      setSessionsError(response.error?.message || 'Could not load your active sessions.');
      return;
    }
    setSessions(response.data.sessions);
  }, []);

  // The tab fetches on first open, not on page mount: most visits never touch
  // this tab, and a stale list is worse than a fresh one.
  useEffect(() => {
    if (activeTab === 'sessions' && sessions === null && !sessionsLoading && !sessionsError) {
      void loadSessions();
    }
  }, [activeTab, sessions, sessionsLoading, sessionsError, loadSessions]);

  const handleRevokeOthers = useCallback(async () => {
    if (revokingSessions) return;
    setRevokingSessions(true);
    const response = await apiClient.revokeOtherSessions();
    setRevokingSessions(false);
    if (!response.success || !response.data) {
      // Step-up failures land here with an honest message: sign in again,
      // then retry. Shown as-is, never rewritten into something vaguer.
      showToast({
        text: response.error?.message || 'Could not revoke other sessions.',
        type: 'error',
      });
      return;
    }
    showToast({ text: response.data.message, type: 'success' });
    await loadSessions();
  }, [revokingSessions, loadSessions]);

  const handleStartSetup = useCallback(async () => {
    setTwoFactorBusy(true);
    setTwoFactorError('');
    setTwoFactorNotice('');
    setSecretCopied(false);
    const response = await apiClient.setupTwoFactor();
    setTwoFactorBusy(false);
    if (!response.success || !response.data) {
      setTwoFactorError(response.error?.message || 'Could not start setup.');
      // A 409 means another tab finished the job. Re-read rather than argue.
      void loadStatus();
      return;
    }
    setVerifyCode('');
    setEnrolment({ secret: response.data.secret, otpauthUri: response.data.otpauthUri });
  }, [loadStatus]);

  const handleConfirmEnable = useCallback(async () => {
    setTwoFactorError('');
    if (!/^\d{6}$/.test(verifyCode)) {
      setTwoFactorError('Enter the 6-digit code shown in your authenticator app.');
      return;
    }
    setTwoFactorBusy(true);
    const response = await apiClient.enableTwoFactor(verifyCode);
    setTwoFactorBusy(false);
    if (!response.success || !response.data) {
      setTwoFactorError(response.error?.message || 'That code did not match.');
      setVerifyCode('');
      return;
    }
    setEnrolment(null);
    setVerifyCode('');
    setCodesCopied(false);
    setFreshCodes(response.data.backupCodes);
    setTwoFactorNotice('Two-factor authentication is on.');
    await loadStatus();
  }, [verifyCode, loadStatus]);

  const cancelSetup = useCallback(() => {
    setEnrolment(null);
    setVerifyCode('');
    setTwoFactorError('');
    setSecretCopied(false);
  }, []);

  const openPasswordPrompt = useCallback((intent: 'disable' | 'regenerate') => {
    setPasswordPrompt(intent);
    setActionPassword('');
    setTwoFactorError('');
    setTwoFactorNotice('');
  }, []);

  const closePasswordPrompt = useCallback(() => {
    setPasswordPrompt(null);
    setActionPassword('');
    setTwoFactorError('');
  }, []);

  const handlePasswordGatedAction = useCallback(async () => {
    if (!passwordPrompt) return;
    if (!actionPassword) {
      setTwoFactorError('Enter your password to confirm.');
      return;
    }
    setTwoFactorBusy(true);
    setTwoFactorError('');

    if (passwordPrompt === 'disable') {
      const response = await apiClient.disableTwoFactor(actionPassword);
      setTwoFactorBusy(false);
      if (!response.success) {
        setTwoFactorError(response.error?.message || 'Could not turn two-factor off.');
        return;
      }
      setFreshCodes(null);
      setTwoFactorNotice('Two-factor authentication is off. Your recovery codes were deleted.');
    } else {
      const response = await apiClient.regenerateBackupCodes(actionPassword);
      setTwoFactorBusy(false);
      if (!response.success || !response.data) {
        setTwoFactorError(response.error?.message || 'Could not generate new recovery codes.');
        return;
      }
      setCodesCopied(false);
      setFreshCodes(response.data.backupCodes);
      setTwoFactorNotice('New recovery codes. The previous set no longer works.');
    }

    closePasswordPrompt();
    await loadStatus();
  }, [passwordPrompt, actionPassword, closePasswordPrompt, loadStatus]);

  // ─── Password Handler ───────────────────────────────────────────────────────
  const handlePasswordChange = useCallback(async () => {
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError('New passwords do not match');
      setPasswordStatus('error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      setPasswordStatus('error');
      return;
    }
    setPasswordStatus('saving');
    const response = await apiClient.changePassword(passwordForm.current, passwordForm.newPassword);
    if (!response.success) {
      setPasswordError(response.error?.message || 'Failed to update password');
      setPasswordStatus('error');
      return;
    }
    setPasswordStatus('success');
    setPasswordForm({ current: '', newPassword: '', confirm: '' });
  }, [passwordForm]);

  // ─── Connected Apps (OAuth grants) ────────────────────────────────────────
  //
  // This tab used to hardcode "No third-party apps connected" and assert that
  // no app held email/profile permission — without ever asking the server.
  // Every claim below comes from GET /oauth/grants. `grants === null` means
  // "not loaded yet"; an empty array is the only honest empty state.
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [grantsError, setGrantsError] = useState('');
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [confirmRevokeClientId, setConfirmRevokeClientId] = useState<string | null>(null);
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
  const [grantsNotice, setGrantsNotice] = useState('');

  const loadGrants = useCallback(async () => {
    setGrantsLoading(true);
    setGrantsError('');
    const response = await apiClient.getOAuthGrants();
    setGrantsLoading(false);
    if (!response.success || !response.data) {
      setGrantsError(response.error?.message || 'Could not load connected apps.');
      return;
    }
    setGrants(response.data);
  }, []);

  const handleRevokeGrant = useCallback(
    async (clientId: string) => {
      setRevokingClientId(clientId);
      setGrantsNotice('');
      const response = await apiClient.revokeOAuthGrant(clientId);
      setRevokingClientId(null);
      setConfirmRevokeClientId(null);
      if (!response.success) {
        setGrantsError(response.error?.message || 'Could not revoke access.');
        return;
      }
      setGrantsNotice('Access revoked. The app must ask your permission again to reconnect.');
      await loadGrants();
    },
    [loadGrants],
  );

  // ─── Personal Access Tokens ───────────────────────────────────────────────
  //
  // The backend routes existed with no UI. The raw token value is shown once,
  // at mint time, from the POST response — it is never stored client-side.
  const [tokens, setTokens] = useState<PersonalAccessToken[] | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState('');
  const [tokensNotice, setTokensNotice] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenScopes, setTokenScopes] = useState<string[]>(['repo:read']);
  const [tokenExpiryDays, setTokenExpiryDays] = useState<number>(90);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState('');
  const [freshToken, setFreshToken] = useState<MintedPersonalAccessToken | null>(null);
  const [freshTokenCopied, setFreshTokenCopied] = useState(false);
  const [confirmRevokeTokenId, setConfirmRevokeTokenId] = useState<string | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError('');
    const response = await apiClient.getPersonalAccessTokens();
    setTokensLoading(false);
    if (!response.success || !response.data) {
      setTokensError(response.error?.message || 'Could not load personal access tokens.');
      return;
    }
    setTokens(response.data);
  }, []);

  const toggleTokenScope = useCallback((scope: string) => {
    setTokenScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }, []);

  const handleMintToken = useCallback(async () => {
    setMintError('');
    setTokensNotice('');
    const name = tokenName.trim();
    if (!name) {
      setMintError('Give the token a name so you can tell it apart later.');
      return;
    }
    if (tokenScopes.length === 0) {
      setMintError('Choose at least one scope.');
      return;
    }
    setMinting(true);
    const expiresAt = new Date(Date.now() + tokenExpiryDays * 24 * 60 * 60 * 1000).toISOString();
    const response = await apiClient.createPersonalAccessToken({
      name,
      scopes: tokenScopes,
      expiresAt,
    });
    setMinting(false);
    if (!response.success || !response.data) {
      // STEP_UP_REQUIRED (401) means the session's last strong authentication
      // is stale: the backend's own message says to sign in again and retry.
      setMintError(response.error?.message || 'Could not create the token.');
      return;
    }
    setFreshToken(response.data);
    setFreshTokenCopied(false);
    setTokenName('');
    setTokenScopes(['repo:read']);
    setTokensNotice('Token created.');
    await loadTokens();
  }, [tokenName, tokenScopes, tokenExpiryDays, loadTokens]);

  const handleRevokeToken = useCallback(
    async (id: string) => {
      setRevokingTokenId(id);
      setTokensNotice('');
      const response = await apiClient.revokePersonalAccessToken(id);
      setRevokingTokenId(null);
      setConfirmRevokeTokenId(null);
      if (!response.success) {
        setTokensError(response.error?.message || 'Could not revoke the token.');
        return;
      }
      setTokensNotice('Token revoked. It stops working immediately.');
      await loadTokens();
    },
    [loadTokens],
  );

  // Lazy-load each tab's data the first time it is opened.
  useEffect(() => {
    if (activeTab === 'connected-apps' && grants === null && !grantsLoading) {
      void loadGrants();
    }
    if (activeTab === 'personal-tokens' && tokens === null && !tokensLoading) {
      void loadTokens();
    }
  }, [activeTab, grants, grantsLoading, loadGrants, tokens, tokensLoading, loadTokens]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page security-workspace flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--quant-foreground)]">
            Security
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-0.5">
            Manage passwords, two-factor authentication, sessions, connected apps, and API tokens.
          </p>
        </div>

        {/* Tab navigation */}
        <nav className="shrink-0 flex items-center gap-1 px-6 mt-4 border-b border-[var(--quant-border)] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                relative px-3 py-2.5 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap
                ${
                  activeTab === tab.key
                    ? 'text-[var(--quant-foreground)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-primary)] after:rounded-t'
                    : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 w-full max-w-4xl mx-auto">
          {activeTab === 'password-auth' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  A rotating code from your phone, on top of your password. Recovery codes cover you
                  if the phone goes missing.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 space-y-4">
                  {twoFactorNotice ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[var(--quant-success)]/25 bg-[var(--quant-success)]/10 px-3 py-2 text-sm text-[var(--quant-success)]"
                    >
                      {twoFactorNotice}
                    </p>
                  ) : null}

                  {statusError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-[var(--quant-destructive)]">{statusError}</p>
                      <Button variant="secondary" size="sm" onClick={() => void loadStatus()}>
                        Try again
                      </Button>
                    </div>
                  ) : null}

                  {!status && !statusError ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="40px" />
                      <Skeleton variant="rect" width="60%" height="20px" />
                    </div>
                  ) : null}
                  {status && !enrolment ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                            status.enabled
                              ? 'bg-[var(--quant-success)]/10 text-[var(--quant-success)]'
                              : 'bg-[var(--quant-muted)] text-[var(--quant-primary)]'
                          }`}
                        >
                          {status.enabled ? (
                            <IconCheck size={20} strokeWidth={2.4} />
                          ) : (
                            <svg
                              className="size-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--quant-foreground)]">
                            {status.enabled ? 'Authenticator app is on' : 'Authenticator app'}
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)]">
                            {status.enabled
                              ? statusSummary(status)
                              : status.pendingSetup
                                ? 'You started setting this up but never confirmed a code, so it is not protecting anything yet.'
                                : 'Sign in with a rotating code from Google Authenticator, 1Password, Authy — any TOTP app.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {status.enabled ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => openPasswordPrompt('regenerate')}
                            >
                              New recovery codes
                            </Button>
                            <Button variant="danger" onClick={() => openPasswordPrompt('disable')}>
                              Turn off
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            loading={twoFactorBusy}
                            onClick={() => void handleStartSetup()}
                          >
                            {status.pendingSetup ? 'Continue setup' : 'Enable 2FA'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {status?.enabled &&
                  !passwordPrompt &&
                  status.backupCodesRemaining <= RECOVERY_CODES_LOW ? (
                    <p className="rounded-xl border border-[var(--quant-primary)]/30 bg-[var(--quant-primary)]/10 shadow-[0_0_12px_rgba(255,140,66,0.1)] px-3.5 py-2.5 text-xs leading-5 text-[var(--brand-accent)]">
                      {status.backupCodesRemaining === 0
                        ? 'No recovery codes left. Generate a new set now — without one, losing your authenticator means losing the account.'
                        : 'Nearly out of recovery codes. Generate a new set while you still have a way in.'}
                    </p>
                  ) : null}
                  {passwordPrompt ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handlePasswordGatedAction();
                      }}
                      className="space-y-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)] px-4 py-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--quant-foreground)]">
                          {passwordPrompt === 'disable'
                            ? 'Turn off two-factor authentication'
                            : 'Replace your recovery codes'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--quant-muted-foreground)]">
                          {passwordPrompt === 'disable'
                            ? 'Your password becomes the only thing protecting this account, and your recovery codes are deleted.'
                            : 'The codes you hold now stop working the moment the new set is issued.'}
                        </p>
                      </div>
                      <div className="max-w-xs">
                        <FormField label="Password" required>
                          <Input
                            type="password"
                            value={actionPassword}
                            onChange={(event) => setActionPassword(event.target.value)}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                          />
                        </FormField>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="submit"
                          variant={passwordPrompt === 'disable' ? 'danger' : 'primary'}
                          loading={twoFactorBusy}
                        >
                          {passwordPrompt === 'disable' ? 'Turn off' : 'Generate new codes'}
                        </Button>
                        <Button variant="ghost" onClick={closePasswordPrompt}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  {enrolment ? (
                    <div className="space-y-5">
                      <ol className="space-y-1 text-sm leading-6 text-[var(--quant-foreground)]">
                        <li>1. Open your authenticator app.</li>
                        <li>2. Scan the code below, or type the setup key in by hand.</li>
                        <li>3. Enter the 6-digit code it shows to finish.</li>
                      </ol>

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="mx-auto shrink-0 rounded-lg border border-[var(--quant-border)] bg-white p-3 sm:mx-0">
                          <TwoFactorQrCode value={enrolment.otpauthUri} size={176} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)] px-4 py-3">
                            <p className="mb-1 text-xs text-[var(--quant-muted-foreground)]">
                              Setup key — for typing in by hand
                            </p>
                            <code className="block select-all break-all font-mono text-sm tracking-wide text-[var(--quant-foreground)]">
                              {groupSecret(enrolment.secret)}
                            </code>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                void copyToClipboard(enrolment.secret).then(setSecretCopied);
                              }}
                            >
                              {secretCopied ? 'Copied' : 'Copy key'}
                            </Button>
                            {/*
                              Hands the secret straight to the app on the device you are
                              holding. Desktop browsers have nothing registered for
                              `otpauth://` and will do nothing at all, which is exactly
                              why the QR and the typed key are both on this card.
                            */}
                            <a
                              href={enrolment.otpauthUri}
                              className="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] sm:min-h-0 sm:py-2"
                            >
                              Open in your authenticator app
                            </a>
                          </div>
                        </div>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleConfirmEnable();
                        }}
                        className="space-y-3 border-t border-[var(--quant-border)] pt-4"
                      >
                        <div className="max-w-[200px]">
                          <FormField label="Code from your app" required>
                            <Input
                              value={verifyCode}
                              onChange={(event) =>
                                setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                              }
                              placeholder="123456"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                            />
                          </FormField>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="submit" variant="primary" loading={twoFactorBusy}>
                            Verify and turn on
                          </Button>
                          <Button variant="ghost" onClick={cancelSetup}>
                            Cancel
                          </Button>
                        </div>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          Recovery codes are issued once this code checks out — not before. A code
                          for a factor that never got switched on is a code nobody can use.
                        </p>
                      </form>
                    </div>
                  ) : null}
                  {twoFactorError ? (
                    <p role="alert" className="text-sm text-[var(--quant-destructive)]">
                      {twoFactorError}
                    </p>
                  ) : null}

                  {freshCodes ? (
                    <div className="space-y-3 rounded-xl border border-[var(--quant-primary)]/30 bg-[var(--quant-primary)]/10 shadow-[0_0_16px_rgba(255,140,66,0.1),inset_0_1px_0_0_rgba(255,255,255,0.06)] px-4 py-4">
                      <div>
                        <h3 className="text-sm font-medium text-[var(--quant-foreground)]">
                          Save your recovery codes
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-[var(--quant-muted-foreground)]">
                          Each one signs you in once if you lose your authenticator. This is the
                          only time they are shown — the server stores hashes, so it cannot show
                          them again even if you ask.
                        </p>
                      </div>
                      <ul className="grid grid-cols-2 gap-2">
                        {freshCodes.map((code) => (
                          <li
                            key={code}
                            className="select-all rounded border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-center font-mono text-xs tracking-wider text-[var(--quant-foreground)]"
                          >
                            {code}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void copyToClipboard(freshCodes.join('\n')).then(setCodesCopied);
                          }}
                        >
                          {codesCopied ? 'Copied' : 'Copy all'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => downloadRecoveryCodes(freshCodes)}
                        >
                          Download
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => setFreshCodes(null)}>
                          I have saved them
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Passkeys
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Sign in with a fingerprint, face, or PIN instead of your password. A passkey
                  with user verification also stands in for your authenticator code at sign-in;
                  one without it still asks for the code on a two-factor account.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 space-y-4">
                  {passkeysNotice ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[var(--quant-success)]/25 bg-[var(--quant-success)]/10 px-3 py-2 text-sm text-[var(--quant-success)]"
                    >
                      {passkeysNotice}
                    </p>
                  ) : null}
                  {passkeysError ? (
                    <p role="alert" className="text-sm text-[var(--quant-destructive)]">
                      {passkeysError}
                    </p>
                  ) : null}
                  {passkeysLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="40px" />
                    </div>
                  ) : passkeys && passkeys.length === 0 ? (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">
                      No passkeys yet. Add one and the login page offers passwordless sign-in.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {(passkeys ?? []).map((passkey) => (
                        <li
                          key={passkey.id}
                          className="flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-[var(--quant-foreground)]">
                              {passkey.name ??
                                (passkey.deviceType
                                  ? `${passkey.deviceType} passkey`
                                  : 'Passkey')}
                            </p>
                            <p className="text-xs text-[var(--quant-muted-foreground)]">
                              Added{' '}
                              {new Date(passkey.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                              {passkey.lastUsedAt
                                ? ` · Last used ${new Date(passkey.lastUsedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
                                : ' · Never used'}
                              {passkey.backedUp ? ' · Backed up' : ''}
                            </p>
                          </div>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={passkeyBusy}
                            onClick={() => void handleDeletePasskey(passkey.id)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-52 flex-1">
                      <FormField label="Passkey name (optional)">
                        <Input
                          type="text"
                          value={passkeyName}
                          onChange={(e) => setPasskeyName(e.target.value)}
                          placeholder="e.g. MacBook Touch ID"
                          maxLength={80}
                        />
                      </FormField>
                    </div>
                    <Button
                      variant="primary"
                      disabled={passkeyBusy}
                      onClick={() => void handleAddPasskey()}
                    >
                      {passkeyBusy ? 'Waiting for your authenticator…' : 'Add a passkey'}
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Change Password
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Update your password regularly to keep your account secure.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="space-y-4 max-w-sm">
                    <FormField label="Current Password" required>
                      <Input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
                        }
                        placeholder="Enter current password"
                      />
                    </FormField>
                    <FormField label="New Password" required>
                      <Input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                        }
                        placeholder="Enter new password"
                      />
                    </FormField>
                    <FormField label="Confirm New Password" required>
                      <Input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                        }
                        placeholder="Confirm new password"
                      />
                    </FormField>

                    {passwordStatus === 'error' && (
                      <div className="rounded-md bg-[var(--quant-destructive)]/10 border border-[var(--quant-destructive)]/20 px-3 py-2">
                        <p className="text-sm text-[var(--quant-destructive)]">
                          {passwordError || 'Passwords do not match'}
                        </p>
                      </div>
                    )}

                    {passwordStatus === 'success' && (
                      <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
                        <p className="text-sm text-green-400">Password updated successfully</p>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button variant="primary" onClick={handlePasswordChange}>
                        {passwordStatus === 'saving' ? 'Updating...' : 'Update Password'}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Active Sessions
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Every browser signed in to your account. If you don&apos;t
                  recognize one, revoke it below.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-6">
                  {sessionsLoading && sessions === null && (
                    <div className="space-y-3" aria-label="Loading sessions">
                      <Skeleton variant="rect" width="100%" height="64px" />
                      <Skeleton variant="rect" width="100%" height="64px" />
                    </div>
                  )}

                  {sessionsError && !sessionsLoading && (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                        Could not load sessions
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto mb-4">
                        {sessionsError}
                      </p>
                      <Button variant="secondary" onClick={() => void loadSessions()}>
                        Try again
                      </Button>
                    </div>
                  )}

                  {!sessionsLoading && !sessionsError && sessions !== null && (
                    <>
                      {sessions.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                            No signed-in browsers found
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                            You are signed in, but the session list came back
                            empty. Try again in a moment.
                          </p>
                        </div>
                      )}

                      {sessions.length > 0 && (
                        <ul className="space-y-2">
                          {sessions.map((session) => {
                            const device =
                              deviceLabelFromUserAgent(session.userAgent) ??
                              'Device details not recorded';
                            return (
                              <li
                                key={session.id}
                                className="flex items-center gap-3 rounded-lg bg-[var(--quant-muted)]/40 px-4 py-3"
                              >
                                <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center shrink-0">
                                  <svg
                                    className="size-5 text-[var(--brand-primary)]"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                  >
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">
                                    {device}
                                  </p>
                                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                                    {session.isCurrent
                                      ? 'This device \u00b7 Active now'
                                      : `Last active ${relativeTime(session.lastActiveAt)}`}
                                  </p>
                                </div>
                                {session.isCurrent && (
                                  <span className="text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">
                                    Current
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {sessions.length === 1 && sessions[0]?.isCurrent && (
                        <div className="text-center pt-6">
                          <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                            Only this device is active
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                            When you sign in on another browser or device, it
                            will appear here.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Session Management
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  End access on other devices. This device stays signed in.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Revoke other sessions
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        {(() => {
                          const availability = describeRevokeAvailability(sessions);
                          // The backend fails closed with 409
                          // CURRENT_SESSION_UNKNOWN when it cannot tell which
                          // session is this device — say so instead of
                          // counting this device among "other" sessions.
                          if (availability.currentUnknown) {
                            return 'We couldn\u2019t identify this device in the list, so revoking other sessions is unavailable right now. Sign in again, then retry.';
                          }
                          const others = availability.othersCount;
                          return others > 0
                            ? `Sign out ${others} other ${others === 1 ? 'session' : 'sessions'} now.`
                            : 'Sign out of every device except the one you\u2019re using now.';
                        })()}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      disabled={
                        sessions === null ||
                        sessionsLoading ||
                        revokingSessions ||
                        !describeRevokeAvailability(sessions).enabled
                      }
                      onClick={() => void handleRevokeOthers()}
                    >
                      {revokingSessions ? 'Revoking\u2026' : 'Revoke All'}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'connected-apps' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Connected Applications
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Third-party applications that have access to your QuantMail account.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  {grantsNotice ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[var(--quant-success)]/25 bg-[var(--quant-success)]/10 px-3 py-2 text-sm text-[var(--quant-success)] mb-4"
                    >
                      {grantsNotice}
                    </p>
                  ) : null}

                  {grantsError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 mb-4">
                      <p className="text-sm text-[var(--quant-destructive)]">{grantsError}</p>
                      <Button variant="secondary" size="sm" onClick={() => void loadGrants()}>
                        Try again
                      </Button>
                    </div>
                  ) : null}

                  {(grants === null && !grantsError) || grantsLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="76px" />
                      <Skeleton variant="rect" width="100%" height="76px" />
                    </div>
                  ) : null}

                  {grants && grants.length === 0 && !grantsError ? (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-full bg-[var(--quant-muted)] flex items-center justify-center mx-auto mb-4 text-[var(--quant-muted-foreground)]">
                        <svg
                          className="size-6"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                        No third-party apps connected
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                        When you authorize third-party applications to access your account, they
                        will appear here. You can revoke access at any time.
                      </p>
                    </div>
                  ) : null}

                  {grants && grants.length > 0 && !grantsError ? (
                    <ul className="space-y-3">
                      {grants.map((grant) => (
                        <li
                          key={grant.clientId}
                          className="rounded-md border border-[var(--quant-border)] p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-md bg-[var(--quant-muted)] flex items-center justify-center shrink-0">
                              <span className="text-sm font-semibold text-[var(--quant-primary)]">
                                {grant.clientName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-[var(--quant-foreground)]">
                                  {grant.clientName}
                                </p>
                                {grant.isFirstParty ? (
                                  <span className="text-[11px] font-medium text-[var(--quant-muted-foreground)] bg-[var(--quant-muted)] px-2 py-0.5 rounded-full">
                                    Quant
                                  </span>
                                ) : null}
                              </div>
                              {grant.clientDescription ? (
                                <p className="text-xs text-[var(--quant-muted-foreground)] mt-0.5">
                                  {grant.clientDescription}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {grant.scopes.map((scope) => (
                                  <span
                                    key={scope}
                                    title={describeOAuthScope(scope)}
                                    className="text-[11px] font-mono text-[var(--quant-muted-foreground)] bg-[var(--quant-muted)] px-2 py-0.5 rounded-full"
                                  >
                                    {scope}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-[var(--quant-muted-foreground)] mt-1.5">
                                Connected {formatDate(grant.grantedAt)}
                              </p>
                            </div>
                            {confirmRevokeClientId === grant.clientId ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={revokingClientId === grant.clientId}
                                  onClick={() => void handleRevokeGrant(grant.clientId)}
                                >
                                  {revokingClientId === grant.clientId ? 'Revoking…' : 'Confirm'}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setConfirmRevokeClientId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmRevokeClientId(grant.clientId)}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="pt-3 mt-4 border-t border-[var(--quant-border)]">
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      Revoking removes the app&apos;s saved authorization — it must ask your
                      permission again to reconnect. Tokens it already holds keep working until
                      they expire (15 minutes).
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Manage OAuth Apps
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Control which apps can access your data through OAuth 2.0.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  {(grants === null && !grantsError) || grantsLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="44px" />
                      <Skeleton variant="rect" width="80%" height="44px" />
                    </div>
                  ) : null}

                  {grantsError ? (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">
                      Could not load permission details.{' '}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-[var(--quant-foreground)]"
                        onClick={() => void loadGrants()}
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}

                  {grants && grants.length === 0 && !grantsError ? (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">
                      No permissions granted. When you authorize an app, the permissions it holds
                      will be listed here.
                    </p>
                  ) : null}

                  {grants && grants.length > 0 && !grantsError ? (
                    <div className="space-y-4">
                      {groupGrantsByScope(grants).map(({ scope, clientNames }) => (
                        <div key={scope} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-md bg-[var(--quant-muted)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--quant-primary)]">
                            <svg
                              className="size-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--quant-foreground)] font-mono">
                              {scope}
                            </p>
                            <p className="text-xs text-[var(--quant-muted-foreground)]">
                              {describeOAuthScope(scope)} · granted to {clientNames.join(', ')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="pt-3 mt-4 border-t border-[var(--quant-border)]">
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      These permissions come from the apps listed above. Revoke an app to take
                      back every permission it holds.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'personal-tokens' && (
            <div className="w-full space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Personal Access Tokens
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Long-lived tokens for scripts and API access. They act as you — treat them like
                  passwords and revoke any you no longer use.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  {tokensNotice ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[var(--quant-success)]/25 bg-[var(--quant-success)]/10 px-3 py-2 text-sm text-[var(--quant-success)] mb-4"
                    >
                      {tokensNotice}
                    </p>
                  ) : null}

                  {tokensError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 mb-4">
                      <p className="text-sm text-[var(--quant-destructive)]">{tokensError}</p>
                      <Button variant="secondary" size="sm" onClick={() => void loadTokens()}>
                        Try again
                      </Button>
                    </div>
                  ) : null}

                  {(tokens === null && !tokensError) || tokensLoading ? (
                    <div className="space-y-3">
                      <Skeleton variant="rect" width="100%" height="64px" />
                      <Skeleton variant="rect" width="100%" height="64px" />
                    </div>
                  ) : null}

                  {tokens && tokens.length === 0 && !tokensError ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium text-[var(--quant-foreground)] mb-1">
                        No personal access tokens
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                        Create one below when a script or integration needs to call the API on
                        your behalf.
                      </p>
                    </div>
                  ) : null}

                  {tokens && tokens.length > 0 && !tokensError ? (
                    <ul className="space-y-3">
                      {tokens.map((token) => {
                        const status = personalAccessTokenStatus(token);
                        return (
                          <li
                            key={token.id}
                            className="rounded-md border border-[var(--quant-border)] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-[var(--quant-foreground)]">
                                    {token.name}
                                  </p>
                                  <span
                                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                      status === 'active'
                                        ? 'text-green-400 bg-green-500/10'
                                        : status === 'expired'
                                          ? 'text-amber-400 bg-amber-500/10'
                                          : 'text-[var(--quant-muted-foreground)] bg-[var(--quant-muted)]'
                                    }`}
                                  >
                                    {status === 'active'
                                      ? 'Active'
                                      : status === 'expired'
                                        ? 'Expired'
                                        : 'Revoked'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {token.scopes.map((scope) => (
                                    <span
                                      key={scope}
                                      className="text-[11px] font-mono text-[var(--quant-muted-foreground)] bg-[var(--quant-muted)] px-2 py-0.5 rounded-full"
                                    >
                                      {scope}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1.5">
                                  Created {formatDate(token.createdAt)} · Expires{' '}
                                  {formatDate(token.expiresAt)} · Last used{' '}
                                  {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                                </p>
                              </div>
                              {status === 'active' ? (
                                confirmRevokeTokenId === token.id ? (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      disabled={revokingTokenId === token.id}
                                      onClick={() => void handleRevokeToken(token.id)}
                                    >
                                      {revokingTokenId === token.id ? 'Revoking…' : 'Confirm'}
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setConfirmRevokeTokenId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setConfirmRevokeTokenId(token.id)}
                                  >
                                    Revoke
                                  </Button>
                                )
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Create a token
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Mint a new token. The value is shown once — copy it before you leave.
                </p>
                <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  {freshToken ? (
                    <div className="space-y-4">
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                        <p className="text-sm font-medium text-amber-400">
                          Copy your token now — you won&apos;t see it again.
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 min-w-0 text-xs font-mono break-all bg-black/40 rounded px-3 py-2 text-[var(--quant-foreground)]">
                            {freshToken.token}
                          </code>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void copyToClipboard(freshToken.token).then(setFreshTokenCopied)
                            }
                          >
                            {freshTokenCopied ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => setFreshToken(null)}>
                        I have saved it
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-sm">
                      <FormField label="Token name" required>
                        <Input
                          value={tokenName}
                          onChange={(e) => setTokenName(e.target.value)}
                          placeholder="e.g. CI deploy script"
                          maxLength={100}
                        />
                      </FormField>

                      <div>
                        <p className="text-sm font-medium text-[var(--quant-foreground)] mb-2">
                          Scopes
                        </p>
                        <div className="space-y-2">
                          {PAT_SCOPES.map((scope) => (
                            <label
                              key={scope.value}
                              className="flex items-start gap-2.5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={tokenScopes.includes(scope.value)}
                                onChange={() => toggleTokenScope(scope.value)}
                                className="mt-1 accent-[var(--brand-primary)]"
                              />
                              <span>
                                <span className="text-sm font-mono text-[var(--quant-foreground)]">
                                  {scope.label}
                                </span>
                                <span className="text-xs text-[var(--quant-muted-foreground)] block">
                                  {scope.description}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <FormField label="Expires">
                        <select
                          value={tokenExpiryDays}
                          onChange={(e) => setTokenExpiryDays(Number(e.target.value))}
                          className="w-full rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-2 text-sm text-[var(--quant-foreground)]"
                        >
                          {PAT_EXPIRIES.map((expiry) => (
                            <option key={expiry.value} value={expiry.value}>
                              {expiry.label}
                            </option>
                          ))}
                        </select>
                      </FormField>

                      {mintError ? (
                        <div
                          role="alert"
                          className="rounded-md bg-[var(--quant-destructive)]/10 border border-[var(--quant-destructive)]/20 px-3 py-2"
                        >
                          <p className="text-sm text-[var(--quant-destructive)]">{mintError}</p>
                        </div>
                      ) : null}

                      <div className="pt-1">
                        <Button
                          variant="primary"
                          disabled={minting}
                          onClick={() => void handleMintToken()}
                        >
                          {minting ? 'Creating…' : 'Create token'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
