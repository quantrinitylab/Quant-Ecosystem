/**
 * fix/qm-calendar-nlp-quickadd-invite — resolve quick-add attendee NAMES to
 * contact emails so the created event can send real invites.
 *
 * The parser extracts display names ("Alex"); this module maps each name to
 * the user's contacts via an injected search function (kept injectable so it
 * unit-tests without DOM or network). Rules:
 * - an exact name match (case-insensitive) wins over a fuzzy first hit;
 * - candidates without an email-shaped address are skipped, never invented;
 * - a failed lookup resolves to `email: null` so the caller can say honestly
 *   "Alex is not in your contacts — no invite sent" instead of guessing.
 */

export interface AttendeeCandidate {
  name: string;
  email: string;
}

export interface ResolvedAttendee {
  /** Display name as the user typed it ("Alex"). */
  name: string;
  /** Contact email, or null when no contact matched — never fabricated. */
  email: string | null;
}

export async function resolveAttendeeEmails(
  names: string[],
  search: (query: string) => Promise<AttendeeCandidate[]>,
): Promise<ResolvedAttendee[]> {
  const settled = await Promise.allSettled(names.map((n) => search(n)));
  return names.map((name, i) => {
    const r = settled[i];
    let email: string | null = null;
    if (r.status === 'fulfilled') {
      const candidates = (r.value ?? []).filter(
        (c) => c && typeof c.email === 'string' && c.email.includes('@'),
      );
      const want = name.trim().toLowerCase();
      const pick =
        candidates.find((c) => (c.name ?? '').trim().toLowerCase() === want) ?? candidates[0];
      if (pick) email = pick.email.trim();
    }
    return { name, email };
  });
}
