'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface HoverActionsProps {
  emailId: string;
  isRead: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onSnooze: () => void;
  onLabel?: () => void;
}

/**
 * Gmail-style hover action bar that appears on the right side of an email row.
 * Shows: Archive, Delete, Mark Read/Unread, Snooze, Label.
 * Hidden on touch/coarse-pointer devices via shell.css.
 */
export const HoverActions = memo(function HoverActions({
  emailId,
  isRead,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onSnooze,
  onLabel,
}: HoverActionsProps) {
  return (
    <motion.div
      className="hover-actions"
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Quick actions"
    >
      <button
        type="button"
        className="hover-action-btn"
        onClick={onArchive}
        aria-label="Archive"
        title="Archive (E)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
      </button>
      <button
        type="button"
        className="hover-action-btn"
        onClick={onDelete}
        aria-label="Delete"
        title="Delete (#)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
          <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
        </svg>
      </button>
      <button
        type="button"
        className="hover-action-btn"
        onClick={isRead ? onMarkUnread : onMarkRead}
        aria-label={isRead ? 'Mark unread' : 'Mark read'}
        title={isRead ? 'Mark unread (U)' : 'Mark read (U)'}
      >
        {isRead ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
            <circle cx="18" cy="6" r="3" fill="#FF7A00" stroke="none" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="hover-action-btn"
        onClick={onSnooze}
        aria-label="Snooze"
        title="Snooze"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2" />
          <path d="M5 3 2 6" />
          <path d="m22 6-3-3" />
        </svg>
      </button>
      {onLabel && (
        <button
          type="button"
          className="hover-action-btn"
          onClick={onLabel}
          aria-label="Add label"
          title="Add label (L)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        </button>
      )}
    </motion.div>
  );
});
