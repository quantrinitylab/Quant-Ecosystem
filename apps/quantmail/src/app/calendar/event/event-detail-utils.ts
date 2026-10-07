// ============================================================================
// QuantMail — Calendar event-detail pure helpers (K10 / M09).
//
// Kept free of React so the formatting contract is unit-testable.
// ============================================================================

export type RsvpStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Maybe',
  pending: 'No response',
};

export function formatWhen(
  start: string | Date,
  end: string | Date,
  allDay: boolean,
  timeZone?: string,
): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime())) return 'Unknown time';
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  if (allDay) return s.toLocaleDateString([], dateOpts);
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  };
  const startStr = s.toLocaleString([], { ...dateOpts, ...timeOpts });
  if (Number.isNaN(e.getTime()) || e.getTime() === s.getTime()) return startStr;
  const sameDay = s.toDateString() === e.toDateString();
  const endStr = sameDay
    ? e.toLocaleTimeString([], timeOpts)
    : e.toLocaleString([], { ...dateOpts, ...timeOpts });
  return `${startStr} – ${endStr}`;
}

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function rsvpTone(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'declined':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'tentative':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default:
      return 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] border-[var(--quant-border)]';
  }
}

export function toLocalInputValue(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Strip the embedded __QUANT_META__ JSON block the backend stores inside
 * descriptions before rendering or seeding the edit form.
 */
export function stripQuantMeta(description: string | undefined): string {
  return (description ?? '').replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__/g, '').trim();
}

// The backend DTO is looser than the CalendarEvent interface (attendees are
// {email,name,status}, reminders are label strings, recurrence is an RRULE).
export interface EventDetailDto {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  timeZone?: string;
  attendees?: Array<{ email: string; name?: string; status?: string }>;
  reminders?: string[];
  recurrence?: string | null;
}
