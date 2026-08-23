'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-badge-menu"
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
        <span className="text-xs text-[var(--quant-muted-foreground)]" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div
          id="account-badge-menu"
          role="menu"
          className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-30 mb-1 overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#121622] shadow-2xl animate-scale-in"
        >
          {/* Multi-Account Switcher Section */}
          <div className="p-2 border-b border-zinc-800 space-y-1">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Accounts ({accounts.length})
            </p>
            {accounts.map((acc) => {
              const isCurrent = acc.email.toLowerCase() === user.email.toLowerCase();
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSwitchAccount(acc)}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                    isCurrent ? 'bg-zinc-800/80 text-white' : 'hover:bg-zinc-800/50 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="size-7 rounded-full flex-none flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                      style={{ background: gradientFor(acc.email) }}
                    >
                      {initials(acc.displayName || acc.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">
                        {acc.displayName}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate leading-tight">
                        {acc.email}
                      </p>
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="text-[#FF7A00] font-bold text-xs shrink-0">✓</span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleAddAccount}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-[#FF7A00] hover:bg-[#FF7A00]/10 transition-colors"
            >
              <span className="size-5 rounded-lg bg-[#FF7A00]/20 flex items-center justify-center font-bold">
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
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
            >
              <span>⚙</span>
              <span>Settings & Preferences</span>
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
              <span>🚪</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
