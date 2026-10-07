// ============================================================================
// QuantAI - useConversationSearch Hook
// Debounced, server-side conversation search via GET /api/sessions/search.
// Matches on session title OR message content (full history), so it finds
// conversations the locally-loaded list can't (e.g. by something said inside).
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { getAuthToken } from '../lib/auth';

export interface SearchResultConversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ServerSession {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface UseConversationSearchReturn {
  results: SearchResultConversation[];
  isSearching: boolean;
  error: string | null;
  /** True once the query is long enough to trigger a server search. */
  active: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export function useConversationSearch(query: string): UseConversationSearchReturn {
  const [results, setResults] = useState<SearchResultConversation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against out-of-order responses overwriting fresher results.
  const requestSeq = useRef(0);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!active) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    setIsSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(trimmed)}`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);

        const json = (await res.json()) as { data?: { data?: ServerSession[] } };
        // Ignore stale responses.
        if (seq !== requestSeq.current) return;

        const list = (json.data?.data ?? []).map((s) => ({
          id: s.id,
          title: s.title || 'Untitled',
          updatedAt: s.updatedAt,
        }));
        setResults(list);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        if (seq === requestSeq.current) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, active]);

  return { results, isSearching, error, active };
}

export default useConversationSearch;
