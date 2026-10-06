'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QuantyPopupHeader } from './QuantyPopupHeader';
import { QuantyPopupTabs } from './QuantyPopupTabs';
import { QuantyActivityTab } from './tabs/QuantyActivityTab';
import { QuantyApprovalsTab } from './tabs/QuantyApprovalsTab';
import { QuantyBrowserTab } from './tabs/QuantyBrowserTab';
import { QuantyScheduleTab } from './tabs/QuantyScheduleTab';
import { QuantyIdentityTab } from './tabs/QuantyIdentityTab';
import { useQuantyPopupData } from './useQuantyPopupData';
import type { QuantyPopupTabId } from './types';

export interface QuantyPopupProps {
  /** Whether the popup is visible. */
  open?: boolean;
  onClose?: () => void;
  /** Live status line, e.g. the running step's label. Overrides backend status. */
  liveStatus?: string;
  /** True while the agent is actively working (drives the header pulse). */
  busy?: boolean;
  /** Edit SOUL / MEMORY from the Identity tab. */
  onEditIdentity?: (kind: 'soul' | 'memory') => void;
  /** Backend base for popup data. */
  dataApiBase?: string;
  className?: string;
}

/**
 * The 5-tab inspector popup — opened by TAPPING THE LIVE-AGENT AVATAR
 * mid-session (like tapping the Muse avatar in the Muse app).
 *
 * It floats BELOW the avatar (top-[120px]) so the avatar stays visible
 * behind it; X or tapping outside closes it and the session continues.
 * The transparent catcher blocks background interaction while open but
 * never dims the avatar.
 *
 * Header (avatar, name, live status, X, Share) + 5-tab pill bar
 * (Activity, Approvals, Browser, Schedule, Identity) + animated contents
 * wired to the agent core backend.
 *
 * Data honesty: tabs show skeletons while loading and honest empty states
 * when the backend hasn't reported anything — never fabricated rows.
 */
export function QuantyPopup({
  open = false,
  onClose,
  liveStatus,
  busy = false,
  onEditIdentity,
  dataApiBase,
  className = '',
}: QuantyPopupProps) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<QuantyPopupTabId>('activity');
  const { data, loading } = useQuantyPopupData({ apiBase: dataApiBase, enabled: open });

  const badges = useMemo(
    () => ({
      browser: data?.browserTasks.filter((t) => t.status === 'running').length ?? 0,
    }),
    [data],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Transparent catcher: outside-tap closes, avatar never dims */}
          <motion.div
            key="popup-catcher"
            aria-hidden="true"
            className="fixed inset-0 z-[73] bg-transparent"
            initial={reduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          {/* Panel — below the avatar so it stays visible */}
          <motion.div
            key="popup-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quanty details"
            className={`fixed inset-x-0 top-[120px] z-[75] mx-auto flex max-h-[calc(100dvh-200px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl ${className}`}
            initial={reduceMotion ? undefined : { opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <QuantyPopupHeader
              status={liveStatus ?? data?.status ?? 'is idle'}
              busy={busy || badges.browser > 0}
              onClose={onClose}
            />

            <QuantyPopupTabs active={tab} onChange={setTab} badges={badges} />

            {/* Tab contents — animated crossfade */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={reduceMotion ? undefined : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.16 }}
                >
                  {tab === 'activity' && (
                    <QuantyActivityTab entries={data?.activity} loading={loading && !data} />
                  )}
                  {tab === 'approvals' && (
                    <QuantyApprovalsTab approvals={data?.approvals} loading={loading && !data} />
                  )}
                  {tab === 'browser' && (
                    <QuantyBrowserTab tasks={data?.browserTasks} loading={loading && !data} />
                  )}
                  {tab === 'schedule' && (
                    <QuantyScheduleTab tasks={data?.schedule} loading={loading && !data} />
                  )}
                  {tab === 'identity' && (
                    <QuantyIdentityTab
                      identity={data?.identity ?? null}
                      loading={loading && !data}
                      onEdit={onEditIdentity}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
