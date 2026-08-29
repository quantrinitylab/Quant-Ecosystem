'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { Interactive3DLogo } from './Interactive3DLogo';
import { BrandWordmark } from './BrandWordmark';

interface EcosystemWarpMatrixProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
  onRefresh?: () => void;
  onMarkAllRead?: () => void;
}

export function EcosystemWarpMatrix({
  isOpen,
  onClose,
  unreadCount = 0,
  onRefresh,
  onMarkAllRead,
}: EcosystemWarpMatrixProps) {
  const router = useRouter();

  /**
   * The switcher is a full-screen overlay, so while it is up it owns the keyboard.
   * Escape used to be a raw `window` listener, which closed the overlay but left
   * every other binding live underneath it — `e` archived the conversation behind
   * the overlay, and `g i` navigated out from under it.
   */
  useKeyboardScope('warp-matrix', { active: isOpen, exclusive: true });

  useShortcut('escape', onClose, { scope: 'warp-matrix', label: 'Close app switcher' });

  const apps = [
    {
      id: 'mail',
      name: 'QuantMail',
      wordmark: 'mail' as const,
      path: '/',
      description: 'Zero-Noise E2EE Neural Inbox',
      stat:
        unreadCount > 0
          ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
          : 'All caught up · Zero noise',
      badge: unreadCount > 0 ? `${unreadCount} Unread` : 'Zen',
      badgeColor:
        unreadCount > 0
          ? 'bg-[#2B1A11] text-[#FF8C42] border-[#5C3016]'
          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    {
      id: 'calendar',
      name: 'QuantCalendar',
      wordmark: 'calendar' as const,
      path: '/calendar',
      description: 'Quantum timeline & scheduled meetings',
      stat: 'Synced with Google & CalDAV',
      badge: 'Active',
      badgeColor: 'bg-[#FF8C42]/15 text-[#FFB875] border-[#FF8C42]/30',
    },
    {
      id: 'drive',
      name: 'QuantDrive',
      wordmark: 'drive' as const,
      path: '/drive',
      description: 'High-speed cloud memory & encrypted vault',
      stat: '15 GB free tier · AES-256 GCM',
      badge: 'E2EE Vault',
      badgeColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    },
    {
      id: 'contacts',
      name: 'QuantContacts',
      wordmark: 'contacts' as const,
      path: '/contacts',
      description: 'Unified verified identities & directory',
      stat: 'vCard 4.0 & SPF/DKIM synced',
      badge: 'Directory',
      badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    },
    {
      id: 'code',
      name: 'QuantCode',
      wordmark: 'code' as const,
      path: '/codehub',
      description: 'Autonomous Git pipelines with Quanty at helm',
      stat: 'Built-in CI/CD & preview runners',
      badge: 'Pipelines',
      badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl"
          />

          {/* Matrix Modal Window */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 15 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            // A dismissing backdrop and an exclusive keyboard scope already make
            // this a modal dialog; saying so lets a screen reader announce the
            // boundary instead of reading it as more page content.
            role="dialog"
            aria-modal="true"
            aria-label="Switch app"
            className="relative w-full max-w-xl bg-[#111318] border border-[#282C35] rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* Brand hairline. A flat 1px rule rather than the previous gradient
                bloom — the design system rules out radial glow entirely. */}
            <div className="absolute top-0 inset-x-0 h-px bg-[#FF8C42]" />

            {/* Header Lockup */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#282C35] bg-[#16181D]">
              <div className="flex items-center gap-3">
                <Interactive3DLogo
                  app="mail"
                  size={38}
                  unreadCount={unreadCount}
                  showBadge={false}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <BrandWordmark app="mail" size="text-xl" />
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]">
                      Intelligence Matrix
                    </span>
                  </div>
                  <p className="text-xs text-[#A1A4AC] mt-0.5">
                    Unified Neural Ecosystem Status &amp; One-Tap Gateway
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-touch min-w-touch flex-none items-center justify-center rounded-xl text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#1E2128] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                aria-label="Close matrix"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Apps Grid */}
            <div className="p-5 space-y-1.5 max-h-[60vh] overflow-y-auto">
              {apps.map((app) => (
                /* A real `button`, not a clickable `div`: this overlay exists to move
                   between apps quickly, and until now none of its rows were reachable
                   by keyboard at all. The row also drops its own border — the modal
                   already draws one, and stacking a second is the nested-card look the
                   design system rules out. */
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(app.path);
                  }}
                  className="flex w-full min-h-touch items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#16181D] hover:bg-[#1E2128] text-left transition-colors cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Interactive3DLogo app={app.id as any} size={34} showBadge={false} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <BrandWordmark app={app.wordmark} size="text-sm" />
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${app.badgeColor}`}
                        >
                          {app.badge}
                        </span>
                      </div>
                      <p className="text-xs text-[#A1A4AC] truncate mt-0.5">{app.stat}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[#A1A4AC] group-hover:text-[#FF8C42] transition-colors text-xs font-bold pl-2">
                    <span>Open</span>
                    <svg
                      className="size-3.5 flex-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {/* Bottom Quick Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-[#282C35] bg-[#16181D]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onRefresh) onRefresh();
                    onClose();
                  }}
                  className="inline-flex min-h-touch items-center gap-1.5 px-3.5 text-xs font-bold rounded-xl border border-[#282C35] bg-[#1E2128] hover:bg-[#282C35] text-[#F5F5F5] transition-colors active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <svg
                    className="size-3.5 flex-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12a9 9 0 11-3.2-6.9" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  Refresh Signal
                </button>

                {onMarkAllRead && unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarkAllRead();
                      onClose();
                    }}
                    className="inline-flex min-h-touch items-center gap-1.5 px-3.5 text-xs font-bold rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 transition-colors active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    <svg
                      className="size-3.5 flex-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                    Mark All Read
                  </button>
                )}
              </div>

              <span className="text-[11px] text-[#A1A4AC] font-mono">Press Esc to close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
