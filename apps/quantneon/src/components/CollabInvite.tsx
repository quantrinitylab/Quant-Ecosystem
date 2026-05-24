// ============================================================================
// QuantNeon - Collab Invite Component
// Collaborator search and invite flow
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface CollabInviteProps {
  onInviteSent?: (userId: string) => void;
  onCancel?: () => void;
}

interface SearchUser {
  id: string;
  username: string;
  avatar: string;
  fullName: string;
  followers: number;
  isVerified: boolean;
  mutualCount: number;
}

interface InviteState {
  searchQuery: string;
  results: SearchUser[];
  selectedUser: SearchUser | null;
  message: string;
  searching: boolean;
  sending: boolean;
  sent: boolean;
}

const MOCK_USERS: SearchUser[] = [
  { id: 'u1', username: 'style_queen', avatar: '/avatars/sq.jpg', fullName: 'Style Queen', followers: 125000, isVerified: true, mutualCount: 12 },
  { id: 'u2', username: 'art_studio', avatar: '/avatars/as.jpg', fullName: 'Art Studio', followers: 89000, isVerified: false, mutualCount: 8 },
  { id: 'u3', username: 'travel_soul', avatar: '/avatars/ts.jpg', fullName: 'Travel Soul', followers: 234000, isVerified: true, mutualCount: 23 },
  { id: 'u4', username: 'food_lover', avatar: '/avatars/fl.jpg', fullName: 'Food Lover', followers: 67000, isVerified: false, mutualCount: 5 },
  { id: 'u5', username: 'photo_pro', avatar: '/avatars/pp.jpg', fullName: 'Photo Pro', followers: 450000, isVerified: true, mutualCount: 31 },
];

const CollabInvite: React.FC<CollabInviteProps> = ({ onInviteSent, onCancel }) => {
  const [state, setState] = useState<InviteState>({
    searchQuery: '', results: [], selectedUser: null, message: '', searching: false, sending: false, sent: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const search = useCallback(async (query: string) => {
    setState(prev => ({ ...prev, searchQuery: query, searching: true }));
    await new Promise(resolve => setTimeout(resolve, 200));
    const results = query.length > 0 ? MOCK_USERS.filter(u => u.username.includes(query.toLowerCase()) || u.fullName.toLowerCase().includes(query.toLowerCase())) : [];
    setState(prev => ({ ...prev, results, searching: false }));
  }, []);

  const selectUser = useCallback((user: SearchUser) => {
    setState(prev => ({ ...prev, selectedUser: user, searchQuery: '', results: [] }));
  }, []);

  const sendInvite = useCallback(async () => {
    if (!state.selectedUser) return;
    setState(prev => ({ ...prev, sending: true }));
    await new Promise(resolve => setTimeout(resolve, 1000));
    setState(prev => ({ ...prev, sending: false, sent: true }));
    if (onInviteSent) onInviteSent(state.selectedUser.id);
  }, [state.selectedUser, onInviteSent]);

  if (state.sent) {
    return (
      <div className="bg-gray-900 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">✓</div>
        <p className="text-white font-semibold">Invite Sent!</p>
        <p className="text-gray-400 text-sm mt-1">@{state.selectedUser?.username} will be notified</p>
        <button onClick={onCancel} className="mt-4 px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Done</button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">Invite Collaborator</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-white">✕</button>
      </div>
      {!state.selectedUser ? (
        <>
          <input ref={inputRef} type="text" value={state.searchQuery} onChange={(e) => search(e.target.value)} placeholder="Search by username..." className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-pink-500" />
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {state.searching && <p className="text-gray-500 text-xs text-center py-2">Searching...</p>}
            {state.results.map(user => (
              <div key={user.id} onClick={() => selectUser(user)} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden"><img src={user.avatar} alt="" className="w-full h-full object-cover" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1"><span className="text-sm font-medium text-white">{user.username}</span>{user.isVerified && <span className="text-blue-400 text-xs">✓</span>}</div>
                  <span className="text-xs text-gray-500">{user.mutualCount} mutual followers</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center space-x-3 bg-gray-800 rounded-lg p-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden"><img src={state.selectedUser.avatar} alt="" className="w-full h-full object-cover" /></div>
            <div className="flex-1"><span className="text-sm font-medium text-white">{state.selectedUser.username}</span><p className="text-xs text-gray-500">{state.selectedUser.followers.toLocaleString()} followers</p></div>
            <button onClick={() => setState(prev => ({ ...prev, selectedUser: null }))} className="text-gray-400 text-xs">Change</button>
          </div>
          <textarea value={state.message} onChange={(e) => setState(prev => ({ ...prev, message: e.target.value }))} placeholder="Add a message (optional)..." rows={2} className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none resize-none focus:ring-1 focus:ring-pink-500" />
          <button onClick={sendInvite} disabled={state.sending} className="w-full py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center space-x-2">
            {state.sending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Sending...</span></> : <span>Send Invite</span>}
          </button>
        </>
      )}
    </div>
  );
};

export default CollabInvite;
