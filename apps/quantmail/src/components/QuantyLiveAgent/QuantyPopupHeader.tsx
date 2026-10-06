'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BubbleAvatar } from '@quant/shared-ui';
import { ShareIcon, XIcon, CheckIcon } from './QuantyPopupIcons';

export interface QuantyPopupHeaderProps {
  /** Dynamic live status, e.g. "5 emails archive kar raha...", "Planning...". */
  status?: string;
  /** True while the agent is actively doing something. */
  busy?: boolean;
  onClose?: () => void;
  className?: string;
}

/**
 * Inspector popup header: X top-left, Share top-right, the big bubble
 * avatar centered with "Quanty" and a live status line under it.
 *
 * This popup opens when the user taps the live-agent avatar mid-session,
 * so there are no mode buttons here — it's purely the detail view.
 */
export function QuantyPopupHeader({
  status = 'is idle',
  busy = false,
  onClose,
  className = '',
}: QuantyPopupHeaderProps) {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`Quanty — ${status}`);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard blocked — the button simply does nothing harmful */
    }
  };

  return (
    <div className={`relative px-5 pb-4 pt-3 ${className}`}>
      {/* Top row: X left, Share right */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Popup band karein"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <XIcon width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label={shared ? 'Copy ho gaya' : 'Status share karein'}
          title={shared ? 'Copied!' : 'Share'}
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          {shared ? <CheckIcon width={16} height={16} className="text-emerald-400" /> : <ShareIcon width={16} height={16} />}
        </button>
      </div>

      {/* Avatar, name, live status */}
      <div className="-mt-2 flex flex-col items-center">
        <motion.span
          className="block overflow-hidden rounded-full bg-[#14100b] shadow-[0_10px_40px_rgba(255,170,60,0.35)] ring-1 ring-amber-400/40"
          animate={busy ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={busy ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          <BubbleAvatar state={busy ? 'working' : 'idle'} size={84} title="Quanty" />
        </motion.span>
        <h2 className="mt-2 text-lg font-bold text-zinc-50">Quanty</h2>
        <p className="mt-0.5 flex max-w-full items-center gap-1.5 text-[13px] text-zinc-400" aria-live="polite">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${busy ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600'}`}
          />
          <span className="truncate">{status}</span>
        </p>
      </div>
    </div>
  );
}
