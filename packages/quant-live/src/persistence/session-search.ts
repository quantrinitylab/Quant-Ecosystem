import type { ArtifactType, SessionSearchResult } from '../types.js';
import type { SessionStore } from './session-store.js';

export class SessionSearch {
  constructor(private store: SessionStore) {}

  async search(
    userId: string,
    opts: {
      query?: string;
      dateFrom?: number;
      dateTo?: number;
      artifactType?: ArtifactType;
      minDuration?: number;
    },
  ): Promise<SessionSearchResult[]> {
    const { entries } = await this.store.list(userId);
    const results: SessionSearchResult[] = [];

    for (const entry of entries) {
      if (opts.dateFrom && entry.createdAt < opts.dateFrom) continue;
      if (opts.dateTo && entry.createdAt > opts.dateTo) continue;
      if (opts.artifactType && !entry.artifacts.some((a) => a.type === opts.artifactType)) continue;
      if (opts.minDuration && (entry.duration ?? 0) < opts.minDuration) continue;

      const snippets: string[] = [];
      let score = 0;

      if (opts.query) {
        const lower = opts.query.toLowerCase();
        for (const seg of entry.transcript) {
          if (seg.text.toLowerCase().includes(lower)) {
            snippets.push(seg.text);
            score++;
          }
        }
        if (score === 0) continue;
      } else {
        score = 1;
      }

      results.push({ entry, matchingSnippets: snippets, score });
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
