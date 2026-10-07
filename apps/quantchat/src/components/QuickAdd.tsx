// ============================================================================
// QuantChat - QuickAdd Component
// Friend suggestions: cards with avatar/name/mutual friends, add/dismiss
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface FriendSuggestion {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  mutualFriends: number;
  mutualFriendNames: string[];
  source: 'contacts' | 'mutual' | 'nearby' | 'suggested';
  bio?: string;
  isAdded: boolean;
}
interface QuickAddProps {
  userId?: string;
  onAddFriend?: (userId: string) => void;
  maxSuggestions?: number;
}

export const QuickAdd: React.FC<QuickAddProps> = ({ userId, onAddFriend, maxSuggestions = 20 }) => {
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [addedRecently, setAddedRecently] = useState<Set<string>>(new Set());

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/friends/suggestions?limit=${maxSuggestions}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to load suggestions');
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [maxSuggestions]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAdd = useCallback(
    async (friendId: string) => {
      setAddedRecently((prev) => new Set([...prev, friendId]));
      setSuggestions((prev) => prev.map((s) => (s.id === friendId ? { ...s, isAdded: true } : s)));
      try {
        await fetch(`/api/friends/add`, {
          method: 'POST',
          headers: { ...getAuthHeadersWithContent() },
          body: JSON.stringify({ userId: friendId }),
        });
        if (onAddFriend) onAddFriend(friendId);
      } catch (err) {
        setSuggestions((prev) =>
          prev.map((s) => (s.id === friendId ? { ...s, isAdded: false } : s)),
        );
        setAddedRecently((prev) => {
          const n = new Set(prev);
          n.delete(friendId);
          return n;
        });
      }
    },
    [onAddFriend],
  );

  const handleDismiss = useCallback(async (friendId: string) => {
    setDismissed((prev) => new Set([...prev, friendId]));
    try {
      await fetch(`/api/friends/suggestions/${friendId}/dismiss`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));
  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'contacts':
        return 'From Contacts';
      case 'mutual':
        return 'Mutual Friends';
      case 'nearby':
        return 'Nearby';
      default:
        return 'Suggested';
    }
  };

  if (loading)
    return (
      <div className="quick-add-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="suggestion-skeleton"></div>
        ))}
      </div>
    );
  if (error)
    return (
      <div className="quick-add-error">
        <p>{error}</p>
        <button onClick={fetchSuggestions}>Retry</button>
      </div>
    );
  if (visibleSuggestions.length === 0)
    return (
      <div className="quick-add-empty">
        <p>No suggestions right now. Check back later!</p>
      </div>
    );

  return (
    <div className="quick-add">
      <div className="quick-add-header">
        <h2>Quick Add</h2>
        <span className="suggestion-count">{visibleSuggestions.length} suggestions</span>
      </div>
      <div className="suggestions-list">
        {visibleSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`suggestion-card ${suggestion.isAdded ? 'added' : ''}`}
          >
            <div className="suggestion-avatar">
              {suggestion.avatarUrl ? (
                <img src={suggestion.avatarUrl} alt="" />
              ) : (
                <span className="avatar-placeholder">{suggestion.name.charAt(0)}</span>
              )}
            </div>
            <div className="suggestion-info">
              <span className="suggestion-name">{suggestion.name}</span>
              <span className="suggestion-username">@{suggestion.username}</span>
              {suggestion.mutualFriends > 0 && (
                <span className="mutual-friends">
                  {suggestion.mutualFriends} mutual friend{suggestion.mutualFriends > 1 ? 's' : ''}
                  {suggestion.mutualFriendNames.length > 0 &&
                    ` (${suggestion.mutualFriendNames.slice(0, 2).join(', ')})`}
                </span>
              )}
              <span className="suggestion-source">{getSourceLabel(suggestion.source)}</span>
            </div>
            <div className="suggestion-actions">
              {suggestion.isAdded ? (
                <span className="added-badge">\u2713 Added</span>
              ) : (
                <button onClick={() => handleAdd(suggestion.id)} className="add-btn">
                  + Add
                </button>
              )}
              {!suggestion.isAdded && (
                <button onClick={() => handleDismiss(suggestion.id)} className="dismiss-btn">
                  \u2715
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuickAdd;
