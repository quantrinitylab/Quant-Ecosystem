// ============================================================================
// QuantNeon - Collab Posts
// Collab post creation: invite collaborator, shared likes/comments
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface CollabPost {
  id: string;
  creators: Creator[];
  imageUrl: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  status: 'pending' | 'accepted' | 'published' | 'declined';
  createdAt: string;
}

interface Creator {
  id: string;
  username: string;
  avatar: string;
  isVerified: boolean;
}

interface SearchResult {
  id: string;
  username: string;
  avatar: string;
  fullName: string;
  followers: number;
  isVerified: boolean;
}

interface CollabPageState {
  collabs: CollabPost[];
  pendingInvites: CollabPost[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  selectedCollaborator: SearchResult | null;
  caption: string;
  searching: boolean;
}

const MOCK_COLLABS: CollabPost[] = [
  { id: 'col1', creators: [{ id: 'me', username: 'my_account', avatar: '/avatars/me.jpg', isVerified: false }, { id: 'u1', username: 'alex_photo', avatar: '/avatars/alex.jpg', isVerified: true }], imageUrl: '/posts/collab1.jpg', caption: 'Amazing collab shoot at sunset! #photography #collab', likeCount: 4523, commentCount: 89, status: 'published', createdAt: '2024-01-14T10:00:00Z' },
  { id: 'col2', creators: [{ id: 'me', username: 'my_account', avatar: '/avatars/me.jpg', isVerified: false }, { id: 'u2', username: 'travel_emma', avatar: '/avatars/emma.jpg', isVerified: true }], imageUrl: '/posts/collab2.jpg', caption: 'Travel buddies forever! #wanderlust', likeCount: 8901, commentCount: 234, status: 'published', createdAt: '2024-01-10T12:00:00Z' },
];

const MOCK_PENDING: CollabPost[] = [
  { id: 'col3', creators: [{ id: 'u3', username: 'foodie_mark', avatar: '/avatars/mark.jpg', isVerified: false }, { id: 'me', username: 'my_account', avatar: '/avatars/me.jpg', isVerified: false }], imageUrl: '/posts/collab3.jpg', caption: 'Recipe collab coming soon!', likeCount: 0, commentCount: 0, status: 'pending', createdAt: '2024-01-15T08:00:00Z' },
];

const MOCK_SEARCH: SearchResult[] = [
  { id: 'u10', username: 'style_queen', avatar: '/avatars/sq.jpg', fullName: 'Style Queen', followers: 125000, isVerified: true },
  { id: 'u11', username: 'art_collective', avatar: '/avatars/ac.jpg', fullName: 'Art Collective', followers: 89000, isVerified: false },
  { id: 'u12', username: 'fitness_pro', avatar: '/avatars/fp.jpg', fullName: 'Fitness Pro', followers: 234000, isVerified: true },
  { id: 'u13', username: 'music_vibes', avatar: '/avatars/mv.jpg', fullName: 'Music Vibes', followers: 67000, isVerified: false },
];

const CollabPage: React.FC = () => {
  const [state, setState] = useState<CollabPageState>({
    collabs: [],
    pendingInvites: [],
    loading: true,
    error: null,
    creating: false,
    searchQuery: '',
    searchResults: [],
    selectedCollaborator: null,
    caption: '',
    searching: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 400));
        setState(prev => ({ ...prev, collabs: MOCK_COLLABS, pendingInvites: MOCK_PENDING, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load collabs', loading: false }));
      }
    };
    load();
  }, []);

  const searchUsers = useCallback(async (query: string) => {
    setState(prev => ({ ...prev, searchQuery: query, searching: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    const results = query.length > 0
      ? MOCK_SEARCH.filter(u => u.username.includes(query.toLowerCase()) || u.fullName.toLowerCase().includes(query.toLowerCase()))
      : [];
    setState(prev => ({ ...prev, searchResults: results, searching: false }));
  }, []);

  const selectCollaborator = useCallback((user: SearchResult) => {
    setState(prev => ({ ...prev, selectedCollaborator: user, searchQuery: '', searchResults: [] }));
  }, []);

  const sendInvite = useCallback(() => {
    if (!state.selectedCollaborator || !state.caption.trim()) return;
    const newCollab: CollabPost = {
      id: `col_${Date.now()}`,
      creators: [
        { id: 'me', username: 'my_account', avatar: '/avatars/me.jpg', isVerified: false },
        { id: state.selectedCollaborator.id, username: state.selectedCollaborator.username, avatar: state.selectedCollaborator.avatar, isVerified: state.selectedCollaborator.isVerified },
      ],
      imageUrl: '/posts/new-collab.jpg',
      caption: state.caption,
      likeCount: 0,
      commentCount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setState(prev => ({
      ...prev,
      collabs: [newCollab, ...prev.collabs],
      creating: false,
      selectedCollaborator: null,
      caption: '',
    }));
  }, [state.selectedCollaborator, state.caption]);

  const acceptInvite = useCallback((collabId: string) => {
    setState(prev => ({
      ...prev,
      pendingInvites: prev.pendingInvites.filter(c => c.id !== collabId),
      collabs: [{ ...prev.pendingInvites.find(c => c.id === collabId)!, status: 'published' as const }, ...prev.collabs],
    }));
  }, []);

  const declineInvite = useCallback((collabId: string) => {
    setState(prev => ({ ...prev, pendingInvites: prev.pendingInvites.filter(c => c.id !== collabId) }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center space-y-3">
          <p className="text-white">{state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Collabs</h1>
        <button onClick={() => setState(prev => ({ ...prev, creating: true }))} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">+ New Collab</button>
      </header>

      {/* Pending Invites */}
      {state.pendingInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">PENDING INVITES</h2>
          {state.pendingInvites.map(invite => (
            <div key={invite.id} className="bg-gray-900 rounded-xl p-4 flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden">
                <img src={invite.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{invite.creators[0].username} invited you</p>
                <p className="text-xs text-gray-400 truncate">{invite.caption}</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => acceptInvite(invite.id)} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">Accept</button>
                <button onClick={() => declineInvite(invite.id)} className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-xs">Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Published Collabs */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">YOUR COLLABS</h2>
        <div className="grid grid-cols-2 gap-3">
          {state.collabs.filter(c => c.status === 'published').map(collab => (
            <div key={collab.id} className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="aspect-square bg-gray-800 relative">
                <img src={collab.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 flex -space-x-2">
                  {collab.creators.map(creator => (
                    <div key={creator.id} className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 overflow-hidden">
                      <img src={creator.avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <p className="text-xs text-gray-400">{collab.creators.map(c => `@${c.username}`).join(' & ')}</p>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-xs text-gray-500">♥ {collab.likeCount.toLocaleString()}</span>
                  <span className="text-xs text-gray-500">💬 {collab.commentCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {state.collabs.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤝</div>
            <p className="text-white font-semibold">No Collabs Yet</p>
            <p className="text-gray-400 text-sm mt-1">Create a collab post with another creator</p>
          </div>
        )}
      </section>

      {/* Create Collab Modal */}
      {state.creating && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Collab</h2>
              <button onClick={() => setState(prev => ({ ...prev, creating: false }))} className="text-gray-400">✕</button>
            </div>
            {!state.selectedCollaborator ? (
              <div>
                <p className="text-sm text-gray-400 mb-2">Search for a collaborator</p>
                <input
                  type="text"
                  value={state.searchQuery}
                  onChange={(e) => searchUsers(e.target.value)}
                  placeholder="Search by username..."
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-pink-500 mb-3"
                />
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {state.searchResults.map(user => (
                    <div key={user.id} onClick={() => selectCollaborator(user)} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                        <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-medium">{user.username}</span>
                          {user.isVerified && <span className="text-blue-400 text-xs">✓</span>}
                        </div>
                        <span className="text-xs text-gray-500">{user.followers.toLocaleString()} followers</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center space-x-3 bg-gray-800 rounded-lg p-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                    <img src={state.selectedCollaborator.avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{state.selectedCollaborator.username}</span>
                  </div>
                  <button onClick={() => setState(prev => ({ ...prev, selectedCollaborator: null }))} className="text-gray-400 text-xs">Change</button>
                </div>
                <textarea
                  value={state.caption}
                  onChange={(e) => setState(prev => ({ ...prev, caption: e.target.value }))}
                  placeholder="Write a caption..."
                  rows={3}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none resize-none mb-4 focus:ring-1 focus:ring-pink-500"
                />
                <button
                  onClick={sendInvite}
                  disabled={!state.caption.trim()}
                  className="w-full py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700 disabled:opacity-50"
                >Send Invite</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollabPage;
