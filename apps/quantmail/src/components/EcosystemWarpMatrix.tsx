'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      badge: unreadCount > 0 ? `${unreadCount} Unread` : '✓ Zen',
      badgeColor:
        unreadCount > 0
          ? 'bg-[#FF7A00]/20 text-[#FF9933] border-[#FF7A00]/40'
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
      badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
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
            className="relative w-full max-w-xl bg-gradient-to-b from-[#14161F] via-[#0E0F14] to-[#0A0B0E] border border-zinc-700/60 rounded-3xl shadow-[0_16px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(255,122,0,0.15)] overflow-hidden"
          >
            {/* Ambient Top Glow Line */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#FF7A00] to-transparent opacity-80" />

            {/* Header Lockup */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/40">
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
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF7A00]/15 text-[#FF9933] border border-[#FF7A00]/30">
                      Intelligence Matrix
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Unified Neural Ecosystem Status & One-Tap Gateway
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="size-8 inline-flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
                aria-label="Close matrix"
              >
                ✕
              </button>
            </div>

            {/* Apps Grid */}
            <div className="p-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
              {apps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => {
                    onClose();
                    router.push(app.path);
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-[#FF7A00]/40 transition-all cursor-pointer group"
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
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{app.stat}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-[#FF7A00] transition-colors text-xs font-bold pl-2">
                    <span>Open</span>
                    <span>→</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Quick Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/60">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onRefresh) onRefresh();
                    onClose();
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>⚡</span> Refresh Signal
                </button>

                {onMarkAllRead && unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarkAllRead();
                      onClose();
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <span>✓</span> Mark All Read
                  </button>
                )}
              </div>

              <span className="text-[11px] text-zinc-500 font-mono">Press Esc to close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
