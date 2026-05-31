'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { Dialog, Input, Button, Select, Avatar } from '@quant/shared-ui';

interface SharedUser {
  id: string;
  email: string;
  name: string;
  permission: 'viewer' | 'editor' | 'owner';
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  sharedWith?: SharedUser[];
  onShare?: (email: string, permission: string) => void;
  onRemove?: (userId: string) => void;
}

const PERMISSION_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

export function ShareDialog({
  open,
  onClose,
  sharedWith = [],
  onShare,
  onRemove,
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('editor');

  const handleShare = () => {
    if (email.trim() && onShare) {
      onShare(email.trim(), permission);
      setEmail('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Share Document" size="md">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle }}
        className="space-y-4"
      >
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address..."
              aria-label="Email address to share with"
              type="email"
            />
          </div>
          <Select
            options={PERMISSION_OPTIONS}
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            aria-label="Permission level"
          />
          <Button
            variant="primary"
            onClick={handleShare}
            disabled={!email.trim()}
            className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            Share
          </Button>
        </div>

        <AnimatePresence>
          {sharedWith.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium text-[var(--quant-muted-foreground)]">
                People with access
              </h3>
              <ul className="space-y-2" aria-label="Shared users">
                {sharedWith.map((user, index) => (
                  <motion.li
                    key={user.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', ...spring.gentle, delay: index * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-md min-h-[44px]"
                  >
                    <Avatar name={user.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                        {user.email}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--quant-muted-foreground)] capitalize">
                      {user.permission}
                    </span>
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(user.id)}
                        aria-label={`Remove ${user.name}`}
                        className="min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                      >
                        &#10005;
                      </Button>
                    )}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Dialog>
  );
}
