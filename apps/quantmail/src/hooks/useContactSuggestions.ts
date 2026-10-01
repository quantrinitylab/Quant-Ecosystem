import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';
import type { ContactSuggestion } from '../types';

const CACHE_KEY = 'quant-contact-suggestions';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SUGGESTION_LIMIT = 100; // backend caps /contacts/frequent at 100

interface CachedContacts {
  contacts: ContactSuggestion[];
  timestamp: number;
}

/**
 * Fetches contacts from the backend and ranks them by frequency.
 * Caches for 5 minutes in sessionStorage.
 * Used by the ContactAutocomplete in the composer for fast suggestions.
 */
export function useContactSuggestions(): {
  contacts: ContactSuggestion[];
  isLoading: boolean;
  refresh: () => void;
} {
  const [contacts, setContacts] = useState<ContactSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    // Check cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedContacts = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          setContacts(parsed.contacts);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Ignore cache errors
    }

    setIsLoading(true);
    try {
      // The dedicated frequent-contacts endpoint ranks by frequency (then
      // recency, then name) on the server and isn't capped to a single 20-row
      // page the way getContacts({ page: 1 }) was.
      const response = await apiClient.getFrequentContacts(SUGGESTION_LIMIT);
      if (response.success && response.data) {
        const items = Array.isArray(response.data) ? response.data : [];
        const suggestions: ContactSuggestion[] = items.map((c) => ({
          email: c.email,
          name: c.name || undefined,
          avatar: c.avatar || undefined,
          frequency: c.frequency ?? 0,
        }));

        // Already highest-frequency first from the server; this only keeps equal
        // ranks stable if the transport ever reorders them.
        suggestions.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

        setContacts(suggestions);

        // Cache
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ contacts: suggestions, timestamp: Date.now() }),
          );
        } catch {
          // Ignore
        }
      }
    } catch {
      // Silently fail — contacts autocomplete is non-critical
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContacts();
  }, [fetchContacts]);

  return { contacts, isLoading, refresh: fetchContacts };
}
