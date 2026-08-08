'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { IdentityAvatar } from './IdentityAvatar';

interface ForwardHop {
  from: { name?: string; email: string };
  to: { name?: string; email: string };
  date: string;
}

interface EmailForwardChainProps {
  hops: ForwardHop[];
}

/**
 * Visual forward chain — shows how an email traveled through multiple forwards.
 * Gmail shows this as nested quoted text. We show it as a clear visual timeline
 * so you instantly know the email's provenance (who forwarded to whom).
 */
export function EmailForwardChain({ hops }: EmailForwardChainProps) {
  if (!hops || hops.length <= 1) return null;

  return (
    <div className="forward-chain">
      <p className="forward-chain-label">Forward path ({hops.length} hops)</p>
      <div className="forward-chain-track">
        {hops.map((hop, idx) => (
          <motion.div
            key={idx}
            className="forward-chain-hop"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.08 }}
          >
            <IdentityAvatar name={hop.from.name || hop.from.email} size="sm" />
            <div className="forward-chain-detail">
              <span className="forward-chain-sender">{hop.from.name || hop.from.email}</span>
              <span className="forward-chain-arrow">→</span>
              <span className="forward-chain-receiver">{hop.to.name || hop.to.email}</span>
            </div>
            <time className="forward-chain-time">
              {new Date(hop.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </time>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
