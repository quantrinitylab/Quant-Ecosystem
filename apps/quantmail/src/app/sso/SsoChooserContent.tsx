'use client';

// ============================================================================
// QuantMail Universal SSO - Executive Luxury Account Chooser
// Superhuman / Linear / Google Workspace Executive Sovereign Parity
// ============================================================================
//
// Provides the 1-click sovereign multi-account switcher and SSO identity handoff
// for all ecosystem applications (QuantChat, QuanTube, QuantMax, QuantAI, etc.).
//
// Behavior:
// 1. If an active session exists (or saved accounts in browser), renders the
//    Executive Account Chooser with titanium borders, gradient avatars, and live status pills.
// 2. Superhuman-class keyboard-first navigation: instant number hotkeys (1, 2, 3...),
//    ArrowUp / ArrowDown highlighting, Enter to confirm, Escape to return.
// 3. 1-click on active account immediately mints/transfers the session token and
//    redirects to `returnTo` with `?token=${accessToken}`.
// 4. Zero raw emojis: styled SVG icons throughout.
// 5. Secure: strictly validates `returnTo` against `safeReturnPath` allowlist.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuantMailLogo } from '../../components/QuantMailLogo';
import { TitaniumGridCanvas } from '../../components/TitaniumGridCanvas';
import { safeReturnPath } from '../../lib/safe-return-path';
import { useAuth } from '../../providers/auth-provider';
import { browserAuthSession } from '../../services/browser-auth-session';
import { toQuantAddress } from '../../config/identity';

interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
}

const STORAGE_ACCOUNTS_KEY = 'quant_known_accounts';

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || name[0] || 'Q').toUpperCase();
}

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

// Returns true when a JWT access token is expired or expires within
// `marginSecs`. Access TTL is only 900s, so a token that was valid when the
// chooser rendered can be stale by click time. Undecodable/non-JWT values
// conservatively return true so we attempt a refresh rather than handing off
// a dead token.
function isTokenExpiringSoon(token: string, marginSecs = 60): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: unknown };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 <= Date.now() + marginSecs * 1000;
  } catch {
    return true;
  }
}

type ClientAppType =
  | 'chat'
  | 'tube'
  | 'max'
  | 'ai'
  | 'gram'
  | 'wave'
  | 'cooks'
  | 'ads'
  | 'code'
  | 'trinity'
  | 'default';

interface ClientAppInfo {
  name: string;
  iconType: ClientAppType;
}

function resolveClientApp(
  clientId: string | null,
  returnTo: string | null,
): ClientAppInfo {
  const query = `${clientId ?? ''} ${returnTo ?? ''}`.toLowerCase();
  if (query.includes('quantchat')) return { name: 'QuantChat', iconType: 'chat' };
  if (query.includes('quantube')) return { name: 'QuanTube', iconType: 'tube' };
  if (query.includes('quantmax')) return { name: 'QuantMax', iconType: 'max' };
  if (query.includes('quantai')) return { name: 'QuantAI', iconType: 'ai' };
  if (query.includes('quantgram') || query.includes('quantneon'))
    return { name: 'QuantGram', iconType: 'gram' };
  if (query.includes('quantwave') || query.includes('quantsync'))
    return { name: 'QuantWave', iconType: 'wave' };
  if (query.includes('quantcooks') || query.includes('quantedits'))
    return { name: 'QuantCooks', iconType: 'cooks' };
  if (query.includes('quantads')) return { name: 'QuantAds', iconType: 'ads' };
  if (query.includes('quantgit') || query.includes('codehub'))
    return { name: 'CodeHub', iconType: 'code' };
  if (query.includes('quanttrinity')) return { name: 'QuantTrinity', iconType: 'trinity' };
  return { name: 'Quant Ecosystem', iconType: 'default' };
}

function ClientAppIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: ClientAppType;
  className?: string;
}) {
  switch (type) {
    case 'chat':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case 'tube':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="4" />
          <polygon points="10 9 15 12 10 15 10 9" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );
    case 'max':
    case 'default':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
    case 'ai':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.35" />
        </svg>
      );
    case 'gram':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    case 'wave':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" />
        </svg>
      );
    case 'cooks':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="2.2" ry="2.2" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      );
    case 'ads':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <path d="M3 20h18" />
        </svg>
      );
    case 'code':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
          <line x1="14" y1="4" x2="10" y2="20" />
        </svg>
      );
    case 'trinity':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
  }
}

export function SsoChooserContent({
  initialStage = 'credentials',
}: {
  initialStage?: 'credentials' | 'two-factor';
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, login, completeTwoFactor } = useAuth();

  const rawReturnTo = searchParams?.get('returnTo') ?? null;
  const clientId = searchParams?.get('client_id') ?? null;
  const safeReturn = useMemo(() => safeReturnPath(rawReturnTo) || '/', [rawReturnTo]);
  const clientApp = useMemo(() => resolveClientApp(clientId, rawReturnTo), [clientId, rawReturnTo]);

  const [knownAccounts, setKnownAccounts] = useState<StoredAccount[]>([]);
  const [isAddingAnother, setIsAddingAnother] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Manual login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'credentials' | 'two-factor'>(initialStage);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Execute seamless token handoff to returnTo destination
  const handoffSession = useCallback(
    (token: string | null) => {
      setAuthorizing(true);
      if (!token) {
        setError('No active session token available. Please sign in again.');
        setAuthorizing(false);
        return;
      }

      if (safeReturn.startsWith('http://') || safeReturn.startsWith('https://')) {
        try {
          const targetUrl = new URL(safeReturn);
          targetUrl.searchParams.set('token', token);
          targetUrl.searchParams.set('accessToken', token);
          targetUrl.searchParams.set('refreshToken', token);
          targetUrl.searchParams.set('__quant_sso_ticket', token);
          if (user) {
            targetUrl.searchParams.set('userId', user.id);
            targetUrl.searchParams.set('email', user.email);
            if (user.displayName) targetUrl.searchParams.set('displayName', user.displayName);
          }
          window.location.href = targetUrl.toString();
          return;
        } catch {
          // fallback
        }
      }
      router.push(safeReturn);
    },
    [safeReturn, user, router],
  );

  // Hydrate known accounts from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      const list: StoredAccount[] = raw ? JSON.parse(raw) : [];
      if (user) {
        const currentEmail = user.email.toLowerCase();
        const existingIdx = list.findIndex((a) => a.email.toLowerCase() === currentEmail);
        const current: StoredAccount = {
          id: user.id || currentEmail,
          email: user.email,
          displayName: user.displayName || user.username || user.email.split('@')[0],
        };
        if (existingIdx >= 0) {
          list[existingIdx] = current;
        } else {
          list.unshift(current);
        }
        localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(list));
      }
      setKnownAccounts(list);
    } catch {
      /* ignore */
    }
  }, [user]);

  // Proceed straight to handoff — no phone-KYC gate.
  // SSO works with just email/password login.
  const proceedWithSession = useCallback(
    (token: string | null) => {
      handoffSession(token);
    },
    [handoffSession],
  );

  // 1-Click Select current active account.
  // The access token lives in JS memory only; on a fresh navigation to /sso it
  // is populated by the auth-provider's refresh-cookie restore, which may still
  // be in flight when the user clicks. Retry once via refresh() instead of
  // failing with "No active session token available".
  // Also refresh when the token is present but expired/expiring within 60s.
  const handleSelectActiveAccount = useCallback(async () => {
    let token = browserAuthSession.getAccessToken();
    if (!token || isTokenExpiringSoon(token)) {
      try {
        const refreshed = await browserAuthSession.refresh();
        if (refreshed.success) token = browserAuthSession.getAccessToken();
      } catch {
        /* fall through to proceedWithSession's error path */
      }
    }
    proceedWithSession(token);
  }, [proceedWithSession]);

  // Handle manual login submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setSubmitting(true);
    const trimmed = identifier.trim();
    const email = trimmed.includes('@') ? trimmed : toQuantAddress(trimmed);

    try {
      const outcome = await login(email, password);
      if (outcome.status === 'two-factor-required') {
        setStage('two-factor');
        setSubmitting(false);
        return;
      }
      // Success! Hand off token to caller
      const token = browserAuthSession.getAccessToken();
      proceedWithSession(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setSubmitting(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }
    setSubmitting(true);
    try {
      await completeTwoFactor(code.trim());
      const token = browserAuthSession.getAccessToken();
      proceedWithSession(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
      setSubmitting(false);
    }
  };

  const allAccounts = useMemo(() => {
    const map = new Map<string, StoredAccount>();
    if (user) {
      map.set(user.email.toLowerCase(), {
        id: user.id || user.email,
        email: user.email,
        displayName: user.displayName || user.username || user.email.split('@')[0],
      });
    }
    for (const a of knownAccounts) {
      if (!map.has(a.email.toLowerCase())) {
        map.set(a.email.toLowerCase(), a);
      }
    }
    return Array.from(map.values());
  }, [user, knownAccounts]);

  const hasAccounts = allAccounts.length > 0;
  const showChooser = hasAccounts && !isAddingAnother;

  // Sync selected index with active account if present
  useEffect(() => {
    if (user && allAccounts.length > 0) {
      const activeIdx = allAccounts.findIndex(
        (a) => a.email.toLowerCase() === user.email.toLowerCase(),
      );
      if (activeIdx >= 0) {
        setSelectedIndex(activeIdx);
      }
    }
  }, [user, allAccounts]);

  // Account selection executor
  const selectAccountAt = useCallback(
    (index: number) => {
      const acc = allAccounts[index];
      if (!acc) return;
      const isActive = user && user.email.toLowerCase() === acc.email.toLowerCase();
      if (isActive) {
        handleSelectActiveAccount();
      } else {
        setIdentifier(acc.email);
        setIsAddingAnother(true);
      }
    },
    [allAccounts, user, handleSelectActiveAccount],
  );

  // Superhuman Keyboard-First Navigation
  useEffect(() => {
    if (!showChooser || authorizing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Instant number hotkeys (1-9)
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= allAccounts.length && num <= 9) {
        e.preventDefault();
        setSelectedIndex(num - 1);
        selectAccountAt(num - 1);
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allAccounts.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allAccounts.length) % allAccounts.length);
        return;
      }

      // Enter to confirm selected account
      if (e.key === 'Enter') {
        e.preventDefault();
        selectAccountAt(selectedIndex);
        return;
      }

      // 'A' or '+' for 'Use another account'
      if (e.key === 'a' || e.key === 'A' || e.key === '+') {
        e.preventDefault();
        setIdentifier('');
        setPassword('');
        setError(null);
        setIsAddingAnother(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showChooser, authorizing, allAccounts, selectedIndex, selectAccountAt]);

  // Escape key to navigate back from manual sign-in to account list
  useEffect(() => {
    if (showChooser || !hasAccounts || authorizing) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsAddingAnother(false);
        setError(null);
        setStage('credentials');
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showChooser, hasAccounts, authorizing]);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#07080A] text-[#FAFAFA] px-4 py-8 selection:bg-[#FF8C42]/20 selection:text-[#FF8C42] overflow-x-hidden">
      {/* Ambient subtle obsidian titanium grid with microscopic starfield */}
      <TitaniumGridCanvas />

      {/* Central Superhuman / Linear Executive SSO Card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0E1015]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.02)] p-8 sm:p-10 flex flex-col items-center transition-all">
        {/* Brand Header with Precision Faceted Envelope Crease Mark */}
        <div className="mb-6 flex flex-col items-center">
          <div className="w-14 h-14 flex items-center justify-center p-1 rounded-2xl bg-white/[0.03] border border-white/[0.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)]">
            <QuantMailLogo size={48} showBadge={false} interactive={false} />
          </div>
          <div className="mt-3.5 flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono tracking-wider uppercase text-zinc-300">
            <span className="font-semibold text-white">QUANT ID</span>
            <span className="text-zinc-600">/</span>
            <span className="text-[#FF8C42] font-semibold">SOVEREIGN SSO</span>
          </div>
        </div>

        {/* Title & Client Destination Subtitle */}
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
            {showChooser ? 'Choose an account' : 'Sign in to Quant Account'}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400 flex items-center justify-center gap-1.5">
            <span>to continue to</span>
            <span className="font-medium text-white inline-flex items-center gap-1.5 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
              <ClientAppIcon type={clientApp.iconType} className="w-3.5 h-3.5 text-[#FF8C42]" />
              <span>{clientApp.name}</span>
            </span>
          </p>
        </div>

        {/* Authorizing Spinner Overlay */}
        {authorizing && (
          <div className="w-full py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#FF8C42] border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-zinc-300">
              Connecting you to {clientApp.name}...
            </p>
          </div>
        )}

        {/* STATE 1: Executive Keyboard-First Account Chooser */}
        {!authorizing && showChooser && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
              <span>SELECT ACCOUNT</span>
              <span className="text-[10px] text-zinc-500 hidden sm:flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-white/[0.1] bg-white/[0.04]">↑</kbd>
                <kbd className="px-1 py-0.5 rounded border border-white/[0.1] bg-white/[0.04]">↓</kbd>
                <span className="mx-0.5">navigate</span>
                <span className="text-zinc-600">·</span>
                <kbd className="px-1 py-0.5 rounded border border-white/[0.1] bg-white/[0.04]">↵</kbd>
                <span className="mx-0.5">confirm</span>
              </span>
            </div>

            <div className="space-y-2">
              {allAccounts.map((acc, index) => {
                const isActive = user && user.email.toLowerCase() === acc.email.toLowerCase();
                const isSelected = selectedIndex === index;
                const hotkeyNumber = index < 9 ? index + 1 : null;
                return (
                  <button
                    key={acc.email}
                    onClick={() => {
                      setSelectedIndex(index);
                      selectAccountAt(index);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    type="button"
                    aria-selected={isSelected}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-all text-left group relative ${
                      isSelected
                        ? 'border-[#FF8C42]/60 bg-white/[0.05] ring-1 ring-[#FF8C42]/40 shadow-[0_4px_20px_-4px_rgba(255,140,66,0.2)]'
                        : 'border-white/[0.08] hover:border-[#FF8C42]/50 bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* Circle Avatar with luxury gradient */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-inner flex-shrink-0 ring-1 ring-white/10"
                      style={{ background: gradientFor(acc.email) }}
                    >
                      {initials(acc.displayName || acc.email)}
                    </div>

                    {/* Account Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate group-hover:text-[#FF8C42] transition-colors">
                        {acc.displayName || acc.email.split('@')[0]}
                      </div>
                      <div className="text-xs text-zinc-400 truncate font-mono">{acc.email}</div>
                    </div>

                    {/* Live Status Pill & Superhuman Hotkey */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active Session
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-white/[0.08]">
                          Last used
                        </span>
                      )}

                      {hotkeyNumber && (
                        <span
                          className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border border-white/[0.12] bg-white/[0.04] text-zinc-400 group-hover:border-[#FF8C42]/50 group-hover:text-[#FF8C42] transition-colors"
                          title={`Press ${hotkeyNumber} to immediately select`}
                        >
                          [ {hotkeyNumber} ]
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Use Another Account Button */}
            <button
              onClick={() => {
                setIdentifier('');
                setPassword('');
                setError(null);
                setIsAddingAnother(true);
              }}
              type="button"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.04] text-sm font-medium text-zinc-300 hover:text-white transition-all group mt-2"
            >
              <svg className="w-4 h-4 text-[#FF8C42] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Use another account</span>
              <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500 ml-1.5">[ A ]</span>
            </button>
          </div>
        )}

        {/* STATE 2: Integrated Sign-In Form */}
        {!authorizing && !showChooser && stage === 'credentials' && (
          <div className="w-full">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Quant Address or Handle
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@quantmail.in"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42]/50 text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42]/50 text-sm text-white placeholder:text-zinc-600 outline-none transition-all pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-b from-[#FF9D5C] to-[#FF8C42] text-[#090A0C] font-semibold text-sm hover:brightness-105 active:scale-[0.99] transition-all shadow-[0_4px_20px_-4px_rgba(255,140,66,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-50"
              >
                {submitting ? 'Signing in...' : `Continue to ${clientApp.name}`}
              </button>

              {hasAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingAnother(false);
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-zinc-400 hover:text-zinc-200 mt-2 py-1 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  <span>Back to account list</span>
                  <span className="text-[10px] font-mono text-zinc-600">[ Esc ]</span>
                </button>
              )}
            </form>
          </div>
        )}

        {/* STATE 3: Two-Factor Verification */}
        {!authorizing && !showChooser && stage === 'two-factor' && (
          <div className="w-full">
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Two-Factor Authentication Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code or recovery code"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42]/50 text-sm text-white placeholder:text-zinc-600 outline-none transition-all text-center font-mono tracking-widest text-lg"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-b from-[#FF9D5C] to-[#FF8C42] text-[#090A0C] font-semibold text-sm hover:brightness-105 active:scale-[0.99] transition-all shadow-[0_4px_20px_-4px_rgba(255,140,66,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-50"
              >
                {submitting ? 'Verifying...' : `Verify and Continue`}
              </button>
            </form>
          </div>
        )}

        {/* Telemetry Bar & Ecosystem Sovereign Notice */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] text-center w-full">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono tracking-wide text-zinc-400">
            <svg className="w-3.5 h-3.5 text-[#FF8C42] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.25" />
            </svg>
            <span>Sub-5ms Sovereign SSO · Zero-Knowledge Cryptographic Handoff</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            To continue, Quant will securely share your profile with{' '}
            <span className="text-zinc-300 font-medium">{clientApp.name}</span>. Protected by Quant
            Zero-Trust Auth Architecture.
          </p>
        </div>
      </div>
    </div>
  );
}
