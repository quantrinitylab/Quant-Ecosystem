/**
 * Small time formatters for the Quanty popup. All display-only; the data
 * layer keeps ISO strings.
 */

/** "5:48pm" style clock time. */
export function formatClockTime(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase()
      .replace(' ', '');
  } catch {
    return '';
  }
}

/** "7h ago", "3d ago", "just now". */
export function formatRelativeTime(iso: string, now = new Date()): string {
  try {
    const diffMs = now.getTime() - new Date(iso).getTime();
    if (diffMs < 0) return 'soon';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Day bucket for the activity timeline: 'today' | 'yesterday' | 'older'. */
export function dayBucket(iso: string, now = new Date()): 'today' | 'yesterday' | 'older' {
  try {
    const d = new Date(iso);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    if (d >= startOfToday) return 'today';
    if (d >= startOfYesterday) return 'yesterday';
    return 'older';
  } catch {
    return 'older';
  }
}

export const DAY_BUCKET_LABEL: Record<'today' | 'yesterday' | 'older', string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  older: 'Older',
};
