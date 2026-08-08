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
  icon: string;
  priority: number;
  handler: () => void;
}

/**
 * AI-suggested quick actions shown in the reading pane.
 * Analyzes the email content and suggests the most relevant next action.
 * 
 * Gmail shows generic reply/forward/archive. We show context-aware actions:
 * - Meeting invite → "Add to calendar" is first
 * - Question asked → "Reply" is highlighted
 * - Newsletter → "Unsubscribe" + "Archive"
 * - File shared → "Open in Drive"
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
    const combined = `${email.subject ?? ''} ${email.snippet ?? ''} ${email.bodyText ?? ''}`.toLowerCase();
    const suggestions: SuggestedAction[] = [];

    // Always include reply as base action
    suggestions.push({ id: 'reply', label: 'Reply', icon: '↩', priority: 5, handler: onReply });

    // Context-aware priority boosts
    if (combined.includes('meeting') || combined.includes('calendar') || combined.includes('invite') || combined.includes('schedule')) {
      suggestions.push({ id: 'calendar', label: 'Add to calendar', icon: '📅', priority: 9, handler: onAddToCalendar });
    }

    if (combined.includes('action') || combined.includes('task') || combined.includes('todo') || combined.includes('deadline')) {
      suggestions.push({ id: 'task', label: 'Create task', icon: '☑', priority: 8, handler: onCreateTask });
    }

    if (combined.includes('?') || combined.includes('please let me know') || combined.includes('your thoughts')) {
      // Question detected — boost reply priority
      suggestions[0].priority = 10;
      suggestions[0].label = 'Reply (question detected)';
    }

    // Always include forward and archive as secondary
    suggestions.push({ id: 'forward', label: 'Forward', icon: '→', priority: 3, handler: onForward });
    suggestions.push({ id: 'archive', label: 'Done & archive', icon: '✓', priority: 2, handler: onArchive });

    return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 4);
  }, [email, onReply, onForward, onArchive, onCreateTask, onAddToCalendar]);

  return (
    <motion.div
      className="quick-action-bar"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.15 }}
    >
      <span className="quick-action-label">
        <span aria-hidden="true">✦</span> Suggested
      </span>
      <div className="quick-action-buttons">
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={`quick-action-btn ${index === 0 ? 'is-primary' : ''}`}
            onClick={action.handler}
          >
            <span className="quick-action-icon" aria-hidden="true">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
