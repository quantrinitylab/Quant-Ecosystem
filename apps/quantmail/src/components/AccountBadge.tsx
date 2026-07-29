'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';

/** Deterministic gradient from a string, so each identity has a stable color. */
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[.\s_-]+/).filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || name[0] || 'Q').toUpperCase();
}

/** Signed-in identity block for the active sidebar footer. */
export function AccountBadge() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <span className="block truncate text-sm font-medium text-[var(--quant-foreground)]">{name}</span>
          <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">{address}</span>
        </span>
        <span className="text-xs text-[var(--quant-muted-foreground)]" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id="account-badge-menu" role="menu"
          className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-20 mb-1 overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-popover)] shadow-xl animate-scale-in">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); router.push('/settings'); }}
            className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-[var(--quant-muted)]">Settings</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); router.push('/security'); }}
            className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-[var(--quant-muted)]">Security</button>
          <div className="h-px bg-[var(--quant-border)]" role="separator" />
          <button type="button" role="menuitem"
            onClick={async () => { setOpen(false); await logout(); router.push('/login'); }}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--quant-destructive)] hover:bg-[var(--quant-destructive)]/10">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
