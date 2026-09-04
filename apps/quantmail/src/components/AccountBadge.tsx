'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { useAuth } from '../providers/auth-provider';

interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
  token?: string;
}

const STORAGE_ACCOUNTS_KEY = 'quant_known_accounts';

/** Deterministic gradient from a string, so each identity has a stable color. */
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || name[0] || 'Q').toUpperCase();
}

/** Signed-in identity block for the active sidebar footer with Multi-Account switching. */
export function AccountBadge() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync current user into accounts list
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      let list: StoredAccount[] = stored ? JSON.parse(stored) : [];
      const currentEmail = user.email.toLowerCase();
      const existingIdx = list.findIndex((a) => a.email.toLowerCase() === currentEmail);
      const currentAcc: StoredAccount = {
        id: user.id || currentEmail,
        email: user.email,
        displayName: user.displayName || user.username || user.email.split('@')[0],
      };
      if (existingIdx >= 0) {
        list[existingIdx] = currentAcc;
      } else {
        list.push(currentAcc);
      }
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(list));
      setAccounts(list);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /**
   * The menu owns the keyboard while it is out.
   *
   * Both listeners here used to be attached with an empty dependency array, so
   * they ran for the whole session: every Escape anywhere in the app — closing a
   * compose window, clearing a search — also called `setOpen(false)` on a menu
   * that was already shut, and the outside-click handler ran on every click in
   * the product. Scoping it means the binding exists only while it can do
   * something, and masking stops `j`/`k` from walking the list underneath.
   */
  useKeyboardScope('account-menu', { active: open, exclusive: true });

  useShortcut('escape', close, { scope: 'account-menu', label: 'Close account menu' });

  if (!user) return null;

  const name = user.displayName || user.username || 'Account';
  const address = user.email;

  const handleSwitchAccount = (account: StoredAccount) => {
    setOpen(false);
    if (account.email.toLowerCase() === user.email.toLowerCase()) return;
    // Redirect to switch/login or reload with account context
    router.push(`/login?switch_to=${encodeURIComponent(account.email)}`);
  };

  const handleAddAccount = () => {
    setOpen(false);
    router.push('/login?add_account=true');
  };

  return (
    <div ref={ref} className="relative px-3 pb-3 pt-1">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        /*
          Attached only while the menu is mounted. The menu below renders on
          `open`, so a permanent `aria-controls` is an IDREF to nothing for as
          long as the sidebar sits closed — which is nearly always. `menu` is the
          right `aria-haspopup` value here, unlike the inbox filter popover: this
          one really is a `role="menu"`.
        */
        aria-controls={open ? 'account-badge-menu' : undefined}
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--quant-muted)]"
      >
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm"
          style={{ background: gradientFor(address) }}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--quant-foreground)]">
            {name}
          </span>
          <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
            {address}
          </span>
        </span>
        <span
          className="text-xs text-[var(--quant-muted-foreground)] flex items-center justify-center"
          aria-hidden="true"
        >
          <svg
            className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          id="account-badge-menu"
          role="menu"
          className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-30 mb-1 overflow-hidden rounded-2xl border border-[#282C35] bg-[#16181D] shadow-2xl animate-scale-in"
        >
          {/* Multi-Account Switcher Section */}
          <div className="p-2 border-b border-[#282C35] space-y-1">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC]">
              Accounts ({accounts.length})
            </p>
            {accounts.map((acc) => {
              const isCurrent = acc.email.toLowerCase() === user.email.toLowerCase();
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSwitchAccount(acc)}
                  className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl text-left transition-colors ${
                    isCurrent
                      ? 'bg-[#2B1A11] border border-[#5C3016]'
                      : 'hover:bg-[#1C1F26] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: gradientFor(acc.email) }}
                    >
                      {initials(acc.displayName || acc.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate leading-tight">
                        {acc.displayName}
                      </p>
                      <p className="text-[10px] text-[#A1A4AC] truncate leading-tight">
                        {acc.email}
                      </p>
                    </div>
                  </div>
                  {isCurrent && (
                    <svg
                      className="size-3.5 text-[#FF8C42] shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleAddAccount}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-[#FF8C42] hover:bg-[#2B1A11] transition-colors"
            >
              <span className="size-5 rounded-lg bg-[#2B1A11] border border-[#5C3016] flex items-center justify-center font-bold">
                +
              </span>
              <span>Add another account</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="p-1 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/settings');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors"
            >
              <svg
                className="size-3.5 text-[#A1A4AC]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Settings & Preferences</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/security');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors"
            >
              <svg
                className="size-3.5 text-[#A1A4AC]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Security & 2FA</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push('/login');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              <svg
                className="size-3.5 text-rose-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
