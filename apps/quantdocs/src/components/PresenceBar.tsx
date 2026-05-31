'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { Avatar } from '@quant/shared-ui';

interface Viewer {
  id: string;
  name: string;
  avatarUrl?: string;
  color?: string;
}

interface PresenceBarProps {
  viewers?: Viewer[];
}

export function PresenceBar({ viewers = [] }: PresenceBarProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b border-[var(--quant-border)]"
      aria-label={`${viewers.length} ${viewers.length === 1 ? 'person' : 'people'} viewing`}
    >
      <div className="flex -space-x-2">
        <AnimatePresence>
          {viewers.map((viewer) => (
            <motion.div
              key={viewer.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ type: 'spring', ...spring.bouncy }}
            >
              <Avatar
                src={viewer.avatarUrl}
                name={viewer.name}
                size="xs"
                showStatus
                status="online"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {viewers.length > 0 && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-[var(--quant-muted-foreground)]"
        >
          {viewers.length} viewing
        </motion.span>
      )}
    </div>
  );
}
