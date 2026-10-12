'use client';

// F-187: minimal cross-app switcher for the QuantAI sidebar header.
// Root cause: the 10-app CORE_QUANT_APPS registry existed in shared-ui with
// ZERO consumers in apps/quantai/src — cross-app discovery was SSO-login-only.
// This component consumes the registry read-only and renders every app with
// its real SVG mark (never a wordmark, never an emoji) in a compact dark
// dropdown. Minimal iteration for war-room #902 discuss-first review.

import { useEffect, useRef, useState } from 'react';
import { CORE_QUANT_APPS } from '@quant/shared-ui';
import type { CoreQuantAppId, QuantAppDescriptor } from '@quant/shared-ui';

// Lucide-style SVG icon bodies keyed by the registry's icon names.
// (Same artwork family as shared-ui's UniversalAppSwitcher; stroke-based,
// crisp at any size, zero emojis.)
const APP_ICON_BODIES: Record<string, React.ReactNode> = {
  mail: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  'message-square': (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  camera: (
    <>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>
  ),
  sparkles: (
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  ),
  video: (
    <>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </>
  ),
  table: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  utensils: (
    <>
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 11v11M5 2v20M5 7h4a2 2 0 0 0 2-2V2" />
    </>
  ),
  'bar-chart-3': (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function AppIcon({ app }: { app: QuantAppDescriptor }) {
  const body = APP_ICON_BODIES[app.icon];
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
      style={{
        backgroundColor: `${app.accentColor}1A`,
        borderColor: `${app.accentColor}40`,
      }}
      data-testid={`app-switcher-icon-${app.id}`}
    >
      {body ? (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke={app.accentColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          {body}
        </svg>
      ) : (
        <svg className="h-5 w-5" fill={app.accentColor} viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      )}
    </span>
  );
}

export interface AppSwitcherProps {
  /** Registry id of the app hosting this switcher — gets the active highlight. */
  currentApp?: CoreQuantAppId;
  className?: string;
}

export function AppSwitcher({ currentApp = 'quantai', className = '' }: AppSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const apps = Object.values(CORE_QUANT_APPS);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Switch apps — open the Quant ecosystem app launcher"
        title="Switch apps"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground-secondary)] transition-colors hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070B]"
        data-testid="app-switcher-trigger"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
          <circle cx="3" cy="3" r="1.6" />
          <circle cx="8" cy="3" r="1.6" />
          <circle cx="13" cy="3" r="1.6" />
          <circle cx="3" cy="8" r="1.6" />
          <circle cx="8" cy="8" r="1.6" />
          <circle cx="13" cy="8" r="1.6" />
          <circle cx="3" cy="13" r="1.6" />
          <circle cx="8" cy="13" r="1.6" />
          <circle cx="13" cy="13" r="1.6" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Quant ecosystem apps"
          data-testid="app-switcher-panel"
          className="absolute left-0 top-full z-50 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--quant-border)] bg-[#0B0C12] p-2 shadow-2xl"
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--foreground-secondary)]">
            Quant ecosystem
          </p>
          <ul className="space-y-0.5">
            {apps.map((app) => {
              const isCurrent = app.id === currentApp;
              // URL comes straight from the registry — never guessed.
              const href = `${app.productionUrl}${app.defaultRoute}`;
              return (
                <li key={app.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-current={isCurrent ? 'page' : undefined}
                    data-testid={`app-switcher-link-${app.id}`}
                    className={`flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--quant-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
                      isCurrent ? 'ring-1' : ''
                    }`}
                    style={isCurrent ? ({ ['--tw-ring-color' as string]: `${app.accentColor}80` } as React.CSSProperties) : undefined}
                  >
                    <AppIcon app={app} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--foreground)]">
                          {app.name}
                        </span>
                        {isCurrent && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: `${app.accentColor}26`,
                              color: app.accentColor,
                            }}
                          >
                            Current
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--foreground-secondary)]">
                        {app.tagline}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
