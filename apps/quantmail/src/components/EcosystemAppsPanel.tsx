'use client';

// ============================================================================
// QuantMail — Ecosystem apps panel (presentational card)
// ============================================================================
// The deliberate "More from QUANTRINITY" panel: lists the sibling ecosystem
// apps with their verified production URLs. Rendered by MoreAppsMenu, which
// owns open/close state, positioning, backdrop, and Esc handling.
//
// UI rules: pure-black card, NO divider lines between rows (spacing only).
// Icons are simple navigation glyphs — strictly zero raw Unicode emojis.
// ============================================================================

import React from 'react';
import { ECOSYSTEM_APPS, type EcosystemApp } from './ecosystem-apps';
import { handoffToEcosystemApp } from '../app/sso/ecosystem-app-handoff';

function ChatGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function SparkGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function ExternalGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function appGlyph(app: EcosystemApp) {
  return app.id === 'quantchat' ? <ChatGlyph /> : <SparkGlyph />;
}

/**
 * Plain left-clicks on a sibling app do a one-tap SSO handoff (QuantMail is
 * the account home): mint a single-use ticket and navigate with ONLY
 * `?__quant_sso_ticket=` in the URL. Modifier/middle clicks keep native
 * new-tab behavior — the plain URL, i.e. an honest logged-out landing where
 * the sibling app's own login offers "Continue with QuantMail".
 */
function handleAppClick(e: React.MouseEvent<HTMLAnchorElement>, app: EcosystemApp) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void handoffToEcosystemApp(app, (url) => {
    window.location.href = url;
  });
}

export function EcosystemAppsPanel() {
  return (
    <div
      role="menu"
      aria-label="More Quant apps"
      data-testid="ecosystem-apps-panel"
      className="w-64 rounded-2xl bg-black p-2 shadow-[0_16px_48px_rgba(0,0,0,0.85)] border border-white/10"
    >
      <p className="px-2 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
        More from QUANTRINITY
      </p>
      <p className="px-2 pb-1.5 pt-0.5 text-xs text-white/55">Opens in its own app</p>
      <div className="flex flex-col gap-1">
        {ECOSYSTEM_APPS.map((app) => (
          <a
            key={app.id}
            href={app.url}
            role="menuitem"
            data-testid={`ecosystem-app-${app.id}`}
            aria-label={`Open ${app.label} — ${app.tagline}`}
            onClick={(e) => handleAppClick(e, app)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-white/90">
              {appGlyph(app)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-white">{app.label}</span>
              <span className="truncate text-xs text-white/55">{app.tagline}</span>
            </span>
            <span className="shrink-0 text-white/35">
              <ExternalGlyph />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default EcosystemAppsPanel;
