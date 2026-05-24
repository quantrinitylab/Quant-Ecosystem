// ============================================================================
// QuantNeon - Close Friends
// Close friends management, exclusive story toggle
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Friend {
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  isCloseFriend: boolean;
  mutualFollowers: number;
  lastActive: string;
}

interface CloseFriendsPageState {
  friends: Friend[];
  closeFriends: Friend[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  showSuggested: boolean;
  exclusiveStoryMode: boolean;
}

const MOCK_FRIENDS: Friend[] = [
  { id: 'f1', username: 'alex_photo', fullName: 'Alex Chen', avatar: '/avatars/alex.jpg', isCloseFriend: true, mutualFollowers: 15, lastActive: '2024-01-15T20:00:00Z' },
  { id: 'f2', username: 'travel_emma', fullName: 'Emma Wilson', avatar: '/avatars/emma.jpg', isCloseFriend: true, mutualFollowers: 23, lastActive: '2024-01-15T19:00:00Z' },
  { id: 'f3', username: 'foodie_mark', fullName: 'Mark Johnson', avatar: '/avatars/mark.jpg', isCloseFriend: true, mutualFollowers: 8, lastActive: '2024-01-15T18:00:00Z' },
  { id: 'f4', username: 'design_sara', fullName: 'Sara Kim', avatar: '/avatars/sara.jpg', isCloseFriend: false, mutualFollowers: 12, lastActive: '2024-01-15T16:00:00Z' },
  { id: 'f5', username: 'music_jay', fullName: 'Jay Park', avatar: '/avatars/jay.jpg', isCloseFriend: false, mutualFollowers: 19, lastActive: '2024-01-15T14:00:00Z' },
  { id: 'f6', username: 'fit_lisa', fullName: 'Lisa Yang', avatar: '/avatars/lisa.jpg', isCloseFriend: false, mutualFollowers: 7, lastActive: '2024-01-14T20:00:00Z' },
  { id: 'f7', username: 'code_dev', fullName: 'Dev Smith', avatar: '/avatars/dev.jpg', isCloseFriend: true, mutualFollowers: 5, lastActive: '2024-01-14T10:00:00Z' },
  { id: 'f8', username: 'art_nina', fullName: 'Nina Rose', avatar: '/avatars/nina.jpg', isCloseFriend: false, mutualFollowers: 31, lastActive: '2024-01-13T12:00:00Z' },
];

const CloseFriendsPage: React.FC = () => {
  const [state, setState] = useState<CloseFriendsPageState>({
    friends: [], closeFriends: [], loading: true, error: null, searchQuery: '', showSuggested: false, exclusiveStoryMode: true,
  });

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        setState(prev => ({ ...prev, friends: MOCK_FRIENDS, closeFriends: MOCK_FRIENDS.filter(f => f.isCloseFriend), loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load', loading: false }));
      }
    };
    load();
  }, []);

  const toggleCloseFriend = useCallback((friendId: string) => {
    setState(prev => {
      const updated = prev.friends.map(f => f.id === friendId ? { ...f, isCloseFriend: !f.isCloseFriend } : f);
      return { ...prev, friends: updated, closeFriends: updated.filter(f => f.isCloseFriend) };
    });
  }, []);

  const toggleExclusiveMode = useCallback(() => {
    setState(prev => ({ ...prev, exclusiveStoryMode: !prev.exclusiveStoryMode }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-3 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white text-center">
        <div className="space-y-3">
          <p>{state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const filteredFriends = state.searchQuery
    ? state.friends.filter(f => f.username.includes(state.searchQuery.toLowerCase()) || f.fullName.toLowerCase().includes(state.searchQuery.toLowerCase()))
    : state.friends;

  return (
    <div className="min-h-screen bg-black text-white pb-20 px-4">
      <header className="py-4">
        <h1 className="text-xl font-bold">Close Friends</h1>
        <p className="text-gray-400 text-xs mt-1">Only close friends can see your green-ring stories</p>
      </header>

      {/* Exclusive Story Toggle */}
      <div className="bg-gray-900 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Exclusive Stories</p>
          <p className="text-xs text-gray-400 mt-0.5">Only show certain stories to close friends</p>
        </div>
        <button
          onClick={toggleExclusiveMode}
          className={`relative w-11 h-6 rounded-full transition-colors ${state.exclusiveStoryMode ? 'bg-green-600' : 'bg-gray-700'}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${state.exclusiveStoryMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Close Friends Count */}
      <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm">★</div>
          <div>
            <p className="text-sm font-medium">{state.closeFriends.length} Close Friends</p>
            <p className="text-xs text-gray-400">They can see your exclusive content</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={state.searchQuery}
        onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
        placeholder="Search followers..."
        className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-green-500 mb-4"
      />

      {/* Current Close Friends */}
      {state.closeFriends.length > 0 && !state.searchQuery && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">CLOSE FRIENDS</h2>
          <div className="space-y-2">
            {state.closeFriends.map(friend => (
              <div key={friend.id} className="flex items-center space-x-3 p-2 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 p-0.5">
                  <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                    <img src={friend.avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{friend.username}</p>
                  <p className="text-xs text-gray-500">{friend.fullName}</p>
                </div>
                <button onClick={() => toggleCloseFriend(friend.id)} className="px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Followers */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">{state.searchQuery ? 'RESULTS' : 'SUGGESTIONS'}</h2>
        <div className="space-y-2">
          {filteredFriends.filter(f => !f.isCloseFriend).map(friend => (
            <div key={friend.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-900">
              <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                <img src={friend.avatar} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{friend.username}</p>
                <p className="text-xs text-gray-500">{friend.mutualFollowers} mutual followers</p>
              </div>
              <button onClick={() => toggleCloseFriend(friend.id)} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-green-600">
                Add
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default CloseFriendsPage;
