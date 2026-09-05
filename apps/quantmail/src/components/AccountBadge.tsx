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

/**
 * Every focusable row of the menu.
 *
 * AnchoredMenu.tsx asks for `[role="menuitem"]` alone, which is right for a flat
 * action list; here the live account is a `menuitemradio`, so it has to be named
 * too or the arrows skip straight past the accounts.
 */
const MENU_ITEMS = '[role="menuitem"],[role="menuitemradio"]';

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
  const menuRef = useRef<HTMLDivElement>(null);

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
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      /*
        The open menu holds focus (see the effect below), so tearing it down
        without a destination leaves focus on `body` and the next Tab starts from
        the top of the document. mousedown runs before the browser moves focus to
        whatever was clicked, so handing focus back to the trigger here is safe:
        a focusable click target still wins it a moment later.
      */
      const hadFocus = ref.current.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) triggerRef.current?.focus();
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

  /*
    `role="menu"` is a promise about the keyboard, not a label: focus moves into the
    menu when it opens, Up/Down walk it, and the trigger stays the only tab stop.
    This panel declared the role and delivered none of it — every button was its own
    tab stop and the arrows scrolled the inbox behind it.

    Lifted from AnchoredMenu.tsx, which already solves this for the row menus, so the
    two stay the same shape: focus is read off the live DOM rather than mirrored into
    state, because the list is short and a queried index cannot drift out of sync with
    what is rendered.
  */
  const moveFocus = useCallback((delta: number) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(MENU_ITEMS) ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    // From outside the list, ArrowDown enters at the top and ArrowUp at the bottom.
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
    items[(next + items.length) % items.length]?.focus();
  }, []);

  useShortcut('arrowdown', () => moveFocus(1), { scope: 'account-menu', label: 'Next option' });
  useShortcut('arrowup', () => moveFocus(-1), {
    scope: 'account-menu',
    label: 'Previous option',
  });

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>(MENU_ITEMS)?.focus();
  }, [open]);

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
          long as the sidebar sits closed — which is nearly always.

          `menu` is the right `aria-haspopup` value here, unlike the composer's
          popovers: those hold checkboxes and colour swatches and are disclosures,
          while every row of this panel runs a command and shuts it. The role's
          contract — menuitem children, one tab stop, arrow-key traversal — is
          honoured below, which it was not before.
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
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          /* AnchoredMenu makes `menuLabel` a required prop; an unnamed menu is off-pattern here. */
          aria-label="Account"
          onKeyDown={(event) => {
            // A menu is not a place to Tab through. Leave, and let focus land outside.
            if (event.key === 'Tab') setOpen(false);
          }}
          className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-30 mb-1 overflow-hidden rounded-2xl border border-[#282C35] bg-[#16181D] shadow-2xl animate-scale-in"
        >
          {/*
            Multi-Account Switcher Section. `role="none"` on the padding wrapper:
            a bare <div> is `role=generic`, and ARIA 1.2 does not let `menu` own one
            — so the two sections used to swallow every item and the menu read as
            empty. Presentational here, so the menu owns what is inside directly.
          */}
          <div role="none" className="p-2 border-b border-[#282C35] space-y-1">
            <p
              aria-hidden="true"
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC]"
            >
              Accounts ({accounts.length})
            </p>
            {/*
              One of these accounts is the live one and the tick says which, so they
              are radios and `aria-checked` says out loud what the tick draws. The
              name lives on the group because a paragraph is not something a menu is
              allowed to own — hence `aria-hidden` on the heading above.
            */}
            <div role="group" aria-label={`Accounts (${accounts.length})`} className="space-y-1">
              {accounts.map((acc) => {
                const isCurrent = acc.email.toLowerCase() === user.email.toLowerCase();
                return (
                  <button
                    key={acc.email}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    tabIndex={-1}
                    onClick={() => handleSwitchAccount(acc)}
                    className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      isCurrent
                        ? 'bg-[#2B1A11] border border-[#5C3016]'
                        : 'hover:bg-[#1C1F26] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: gradientFor(acc.email) }}
                        aria-hidden="true"
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
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={handleAddAccount}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-[#FF8C42] hover:bg-[#2B1A11] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <span
                className="size-5 rounded-lg bg-[#2B1A11] border border-[#5C3016] flex items-center justify-center font-bold"
                aria-hidden="true"
              >
                +
              </span>
              <span>Add another account</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div role="none" className="p-1 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                router.push('/settings');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                router.push('/security');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
              tabIndex={-1}
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push('/login');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
