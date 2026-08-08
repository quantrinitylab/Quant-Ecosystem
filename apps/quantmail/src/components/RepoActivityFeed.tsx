'use client';

import { motion } from 'framer-motion';
import { IdentityAvatar } from './IdentityAvatar';

interface ActivityItem {
  id: string;
  type: 'commit' | 'pr_opened' | 'pr_merged' | 'issue_opened' | 'issue_closed' | 'release' | 'review';
  actor: { name: string; email?: string; avatarUrl?: string };
  message: string;
  timestamp: string;
  ref?: string; // branch/tag name
}

interface RepoActivityFeedProps {
  activities: ActivityItem[];
  repoName: string;
}

const ACTIVITY_CONFIG: Record<ActivityItem['type'], { icon: string; color: string; verb: string }> = {
  commit: { icon: '●', color: '#4ade80', verb: 'committed' },
  pr_opened: { icon: '◐', color: '#60a5fa', verb: 'opened PR' },
  pr_merged: { icon: '◉', color: '#a78bfa', verb: 'merged' },
  issue_opened: { icon: '○', color: '#fbbf24', verb: 'opened issue' },
  issue_closed: { icon: '●', color: '#666', verb: 'closed issue' },
  release: { icon: '🏷', color: '#4ade80', verb: 'released' },
  review: { icon: '👁', color: '#ec4899', verb: 'reviewed' },
};

/**
 * Repository Activity Feed — real-time activity stream for a repo.
 * GitHub has this on the repo home page. We make it richer with avatars,
 * action verbs, and timeline visualization inside the QuantMail workspace.
 */
export function RepoActivityFeed({ activities, repoName }: RepoActivityFeedProps) {
  if (!activities || activities.length === 0) return null;

  return (
    <div className="repo-activity-feed">
      <header className="activity-feed-header">
        <strong>Recent Activity</strong>
        <span className="activity-feed-repo">{repoName}</span>
      </header>
      <div className="activity-feed-list">
        {activities.map((activity, idx) => {
          const config = ACTIVITY_CONFIG[activity.type];
          return (
            <motion.div
              key={activity.id}
              className="activity-feed-item"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <span className="activity-dot" style={{ color: config.color }}>{config.icon}</span>
              <IdentityAvatar name={activity.actor.name} size="sm" imageUrl={activity.actor.avatarUrl} />
              <div className="activity-content">
                <span className="activity-actor">{activity.actor.name}</span>
                <span className="activity-verb">{config.verb}</span>
                {activity.ref && <code className="activity-ref">{activity.ref}</code>}
              </div>
              <time className="activity-time">
                {formatRelativeTime(activity.timestamp)}
              </time>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
