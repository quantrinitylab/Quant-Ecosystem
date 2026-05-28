import type { UnifiedContact } from './contact-types.js';
import type { ContactStore } from './contact-store.js';

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  return dp[m]![n]!;
}

export type ResolveResult =
  | { match: UnifiedContact }
  | { ambiguous: true; options: UnifiedContact[] }
  | { notFound: true };

export class ContactResolver {
  constructor(private store: ContactStore) {}

  resolve(query: string): ResolveResult {
    const q = query.toLowerCase();
    const all = this.store.getAllContacts();

    // exact match
    const exact = all.filter((c) => c.displayName.toLowerCase() === q);
    if (exact.length === 1) return { match: exact[0]! };

    // startsWith
    const starts = all.filter((c) => c.displayName.toLowerCase().startsWith(q));
    if (starts.length === 1) return { match: starts[0]! };

    // nickname match
    const nickMatches = all.filter((c) => c.nicknames.some((n) => n.toLowerCase() === q));
    if (nickMatches.length === 1) return { match: nickMatches[0]! };

    // relationship label match
    const relMatches = all.filter((c) => c.relationships.some((r) => r.label.toLowerCase() === q));
    if (relMatches.length === 1) return { match: relMatches[0]! };

    // fuzzy match with proportional threshold for short queries
    const threshold = q.length < 6 ? Math.min(2, Math.floor(q.length / 3)) : 2;
    const fuzzy = all.filter((c) => levenshtein(c.displayName.toLowerCase(), q) <= threshold);

    const candidates = fuzzy.length > 0 ? fuzzy : starts.length > 0 ? starts : exact;
    if (candidates.length === 0) return { notFound: true };
    if (candidates.length === 1) return { match: candidates[0]! };

    // recency bias
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const recent = candidates.filter((c) => c.lastContacted && now - c.lastContacted < sevenDays);
    if (recent.length === 1) return { match: recent[0]! };

    return { ambiguous: true, options: candidates };
  }
}
