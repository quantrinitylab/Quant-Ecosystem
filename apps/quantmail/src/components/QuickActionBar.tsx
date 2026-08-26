'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Email } from '../types';

interface QuickActionBarProps {
  email: Email;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onCreateTask: () => void;
  onAddToCalendar: () => void;
}

interface SuggestedAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  priority: number;
  handler: () => void;
}

/**
 * AI-suggested quick actions shown in the reading pane.
 * Analyzes the email content and suggests the most relevant next action.
 */
export function QuickActionBar({
  email,
  onReply,
  onForward,
  onArchive,
  onCreateTask,
  onAddToCalendar,
}: QuickActionBarProps) {
  const actions = useMemo(() => {
    const suggestions: SuggestedAction[] = [];
    const text = (email.bodyText || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const combined = `${subject} ${text}`;

    // Always include reply as base action
    suggestions.push({
      id: 'reply',
      label: 'Reply',
      icon: (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
      ),
      priority: 5,
      handler: onReply,
    });

    // Context-aware priority boosts
    if (
      combined.includes('meeting') ||
      combined.includes('calendar') ||
      combined.includes('invite') ||
      combined.includes('schedule')
    ) {
      suggestions.push({
        id: 'calendar',
        label: 'Add to calendar',
        icon: (
          <svg
            className="size-3.5 text-blue-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
        ),
        priority: 9,
        handler: onAddToCalendar,
      });
    }

    if (
      combined.includes('action') ||
      combined.includes('task') ||
      combined.includes('todo') ||
      combined.includes('deadline')
    ) {
      suggestions.push({
        id: 'task',
        label: 'Create task',
        icon: (
          <svg
            className="size-3.5 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
        priority: 8,
        handler: onCreateTask,
      });
    }

    if (
      combined.includes('?') ||
      combined.includes('please let me know') ||
      combined.includes('your thoughts')
    ) {
      // Question detected — boost reply priority
      suggestions[0].priority = 10;
      suggestions[0].label = 'Reply (question detected)';
    }

    // Always include forward and archive as secondary
    suggestions.push({
      id: 'forward',
      label: 'Forward',
      icon: (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 14 20 9 15 4" />
          <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
        </svg>
      ),
      priority: 3,
      handler: onForward,
    });
    suggestions.push({
      id: 'archive',
      label: 'Done & archive',
      icon: (
        <svg
          className="size-3.5 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="5" x="2" y="3" rx="1" />
          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
          <path d="M10 12h4" />
        </svg>
      ),
      priority: 2,
      handler: onArchive,
    });

    return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 4);
  }, [email, onReply, onForward, onArchive, onCreateTask, onAddToCalendar]);

  return (
    <motion.div
      className="quick-action-bar"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.15 }}
    >
      <span className="quick-action-label flex items-center gap-1">
        <svg
          className="size-3.5 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        Suggested
      </span>
      <div className="quick-action-buttons">
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={`quick-action-btn ${index === 0 ? 'is-primary' : ''} flex items-center gap-1.5`}
            onClick={action.handler}
          >
            <span className="quick-action-icon" aria-hidden="true">
              {action.icon}
            </span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
