import type { GitNotificationItem } from '../components/NotificationsInbox';

// Map the backend GET /repos/notifications payload (see
// backend/services/git-notifications.service.ts) to the inbox item shape.
// Unknown/malformed rows are dropped, never rendered as invented content:
// a row missing its id, title, or category cannot be shown honestly.

export function formatGitTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

const VALID_CATEGORIES = new Set(['assigned', 'participating', 'mentioned', 'review_requested']);
const VALID_TYPES = new Set(['pr', 'issue']);
const VALID_STATUSES = new Set(['open', 'merged', 'closed']);

export function mapGitNotification(raw: unknown): GitNotificationItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.title !== 'string' || !r.title) return null;
  if (typeof r.category !== 'string' || !VALID_CATEGORIES.has(r.category)) return null;
  return {
    id: r.id,
    repo: typeof r.repo === 'string' ? r.repo : '',
    number: typeof r.number === 'number' ? r.number : 0,
    type: VALID_TYPES.has(r.type as string) ? (r.type as 'pr' | 'issue') : 'issue',
    status: VALID_STATUSES.has(r.status as string)
      ? (r.status as 'open' | 'merged' | 'closed')
      : 'open',
    title: r.title,
    author: typeof r.author === 'string' ? r.author : '',
    commentSnippet: typeof r.commentSnippet === 'string' ? r.commentSnippet : undefined,
    timeAgo: formatGitTimeAgo(typeof r.createdAt === 'string' ? r.createdAt : undefined),
    unread: r.unread === true,
    category: r.category as GitNotificationItem['category'],
  };
}

export function mapGitNotifications(raw: unknown): GitNotificationItem[] {
  if (!Array.isArray(raw)) return [];
  const mapped: GitNotificationItem[] = [];
  for (const row of raw) {
    const item = mapGitNotification(row);
    if (item) mapped.push(item);
  }
  return mapped;
}
