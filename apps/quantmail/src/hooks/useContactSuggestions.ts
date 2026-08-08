import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';
import type { ContactSuggestion } from '../components/ContactAutocomplete';

const CACHE_KEY = 'quant-contact-suggestions';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
      const response = await apiClient.getContacts({ page: 1 });
      if (response.success && response.data) {
        const items = Array.isArray(response.data) ? response.data : [];
        const suggestions: ContactSuggestion[] = items.map((c: any) => ({
          email: c.email,
          name: c.name || undefined,
          avatar: c.avatarUrl || undefined,
          frequency: c.emailCount ?? c.interactionCount ?? 0,
        }));

        // Sort by frequency descending
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
