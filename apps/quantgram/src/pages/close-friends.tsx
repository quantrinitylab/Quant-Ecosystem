// ============================================================================
// QuantNeon - Close Friends
// Close friends management wired to the real backend + user search to add.
// ============================================================================

import React, { useState, useCallback } from 'react';
import { PageTransition } from '@quant/shared-ui';
import { useCloseFriends } from '../hooks/useCloseFriends';
import { apiClient } from '../services/api-client';

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const CloseFriendsPage: React.FC = () => {
  const { closeFriends, isLoading, error, toggleCloseFriend, refetch } = useCloseFriends();
  const [exclusiveStoryMode, setExclusiveStoryMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const closeFriendIds = new Set(closeFriends.map((f) => f.id));

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await apiClient.search(q);
      if (response.success && response.data?.users) {
        setResults(response.data.users as SearchUser[]);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      void runSearch(value);
    },
    [runSearch],
  );

  const handleToggle = useCallback(
    async (id: string, makeClose: boolean) => {
      await toggleCloseFriend(id, makeClose);
      await refetch();
    },
    [toggleCloseFriend, refetch],
  );

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14]">
          <div className="w-10 h-10 border-3 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14] text-white text-center">
          <div className="space-y-3">
            <p>{error.message}</p>
            <button
              onClick={() => void refetch()}
              className="min-h-[44px] px-4 py-2 bg-green-600 text-white rounded-lg text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-black dark:bg-[#0F0F14] text-white pb-20">
        <div className="px-4 max-w-2xl mx-auto py-6">
          <header>
            <h1 className="text-xl font-bold">Close Friends</h1>
            <p className="text-gray-400 text-xs mt-1">
              Only close friends can see your green-ring stories
            </p>
          </header>

          {/* Exclusive Story Toggle */}
          <div className="bg-gray-900 dark:bg-gray-800 rounded-xl p-4 mt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Exclusive Stories</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Only show certain stories to close friends
              </p>
            </div>
            <button
              onClick={() => setExclusiveStoryMode((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${exclusiveStoryMode ? 'bg-green-600' : 'bg-gray-700'}`}
              aria-label="Toggle exclusive stories"
              aria-pressed={exclusiveStoryMode}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${exclusiveStoryMode ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          {/* Close Friends Count */}
          <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-4 mt-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm">
                ★
              </div>
              <div>
                <p className="text-sm font-medium">{closeFriends.length} Close Friends</p>
                <p className="text-xs text-gray-400">They can see your exclusive content</p>
              </div>
            </div>
          </div>

          {/* Search to add */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search users to add..."
            className="w-full h-11 bg-gray-900 dark:bg-gray-800 text-white rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-green-500 mt-4"
          />

          {/* Search Results */}
          {searchQuery && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-400 mb-3">
                {searching ? 'SEARCHING...' : 'RESULTS'}
              </h2>
              <div className="space-y-2">
                {results.map((user) => {
                  const isClose = closeFriendIds.has(user.id);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-900 dark:hover:bg-gray-800"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                        <img
                          src={user.avatarUrl ?? ''}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.username}</p>
                        <p className="text-xs text-gray-500">{user.displayName}</p>
                      </div>
                      <button
                        onClick={() => void handleToggle(user.id, !isClose)}
                        className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs ${
                          isClose
                            ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                            : 'bg-gray-800 text-white hover:bg-green-600'
                        }`}
                      >
                        {isClose ? 'Remove' : 'Add'}
                      </button>
                    </div>
                  );
                })}
                {!searching && results.length === 0 && (
                  <p className="text-xs text-gray-500">No users found</p>
                )}
              </div>
            </section>
          )}

          {/* Current Close Friends */}
          {!searchQuery && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-400 mb-3">CLOSE FRIENDS</h2>
              {closeFriends.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No close friends yet. Search above to add some.
                </p>
              ) : (
                <div className="space-y-2">
                  {closeFriends.map((friend) => (
                    <div key={friend.id} className="flex items-center space-x-3 p-2 rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 p-0.5">
                        <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                          <img
                            src={friend.avatarUrl ?? ''}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{friend.username}</p>
                        <p className="text-xs text-gray-500">{friend.displayName}</p>
                      </div>
                      <button
                        onClick={() => void handleToggle(friend.id, false)}
                        className="min-h-[44px] px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default CloseFriendsPage;
