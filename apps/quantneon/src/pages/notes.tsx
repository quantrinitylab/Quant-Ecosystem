// ============================================================================
// QuantNeon - Notes
// Short text status updates (60 chars), visible to followers for 24h
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Note {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  emoji: string | null;
  createdAt: string;
  expiresAt: string;
  isOwn: boolean;
}

interface NotesPageState {
  notes: Note[];
  myNote: Note | null;
  composing: boolean;
  composeText: string;
  selectedEmoji: string | null;
  loading: boolean;
  error: string | null;
  charCount: number;
}

const MAX_CHARS = 60;

const EMOJIS = ['😊', '🎉', '💭', '🎵', '📚', '✈️', '🏋️', '🍕', '💤', '🎮', '💼', '🌙'];

const MOCK_NOTES: Note[] = [
  { id: 'n1', userId: 'u1', username: 'alex_photo', avatar: '/avatars/alex.jpg', text: 'Golden hour magic today', emoji: '📸', createdAt: '2024-01-15T18:00:00Z', expiresAt: '2024-01-16T18:00:00Z', isOwn: false },
  { id: 'n2', userId: 'u2', username: 'travel_emma', avatar: '/avatars/emma.jpg', text: 'Packing for Bali!', emoji: '✈️', createdAt: '2024-01-15T16:00:00Z', expiresAt: '2024-01-16T16:00:00Z', isOwn: false },
  { id: 'n3', userId: 'u3', username: 'foodie_mark', avatar: '/avatars/mark.jpg', text: 'New recipe coming soon', emoji: '🍕', createdAt: '2024-01-15T14:00:00Z', expiresAt: '2024-01-16T14:00:00Z', isOwn: false },
  { id: 'n4', userId: 'u4', username: 'design_sara', avatar: '/avatars/sara.jpg', text: 'Feeling creative today', emoji: '🎨', createdAt: '2024-01-15T12:00:00Z', expiresAt: '2024-01-16T12:00:00Z', isOwn: false },
  { id: 'n5', userId: 'u5', username: 'music_jay', avatar: '/avatars/jay.jpg', text: 'Studio session all night', emoji: '🎵', createdAt: '2024-01-15T10:00:00Z', expiresAt: '2024-01-16T10:00:00Z', isOwn: false },
];

const NotesPage: React.FC = () => {
  const [state, setState] = useState<NotesPageState>({
    notes: [],
    myNote: null,
    composing: false,
    composeText: '',
    selectedEmoji: null,
    loading: true,
    error: null,
    charCount: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        setState(prev => ({ ...prev, notes: MOCK_NOTES, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load notes', loading: false }));
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (state.composing && inputRef.current) inputRef.current.focus();
  }, [state.composing]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.slice(0, MAX_CHARS);
    setState(prev => ({ ...prev, composeText: text, charCount: text.length }));
  }, []);

  const publishNote = useCallback(() => {
    if (!state.composeText.trim()) return;
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const newNote: Note = {
      id: `n_${Date.now()}`,
      userId: 'me',
      username: 'my_account',
      avatar: '/avatars/me.jpg',
      text: state.composeText,
      emoji: state.selectedEmoji,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      isOwn: true,
    };
    setState(prev => ({
      ...prev,
      myNote: newNote,
      composing: false,
      composeText: '',
      selectedEmoji: null,
      charCount: 0,
    }));
  }, [state.composeText, state.selectedEmoji]);

  const deleteMyNote = useCallback(() => {
    setState(prev => ({ ...prev, myNote: null }));
  }, []);

  const selectEmoji = useCallback((emoji: string) => {
    setState(prev => ({
      ...prev,
      selectedEmoji: prev.selectedEmoji === emoji ? null : emoji,
    }));
  }, []);

  const getTimeRemaining = (expiresAt: string): string => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h left`;
    const mins = Math.floor(remaining / (1000 * 60));
    return `${mins}m left`;
  };

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
      <header className="py-4">
        <h1 className="text-xl font-bold">Notes</h1>
        <p className="text-gray-400 text-xs mt-1">Share a thought (disappears after 24h)</p>
      </header>

      {/* My Note / Create */}
      <section className="mb-6">
        {state.myNote ? (
          <div className="bg-gray-900 rounded-2xl p-4 relative">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 p-0.5">
                  <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                    <img src={state.myNote.avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                </div>
                {state.myNote.emoji && (
                  <span className="absolute -bottom-1 -right-1 text-lg">{state.myNote.emoji}</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Your note</p>
                <div className="bg-gray-800 rounded-xl px-3 py-2 mt-1 relative">
                  <p className="text-sm">{state.myNote.text}</p>
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-800 rotate-45" />
                </div>
                <p className="text-xs text-gray-500 mt-1">{getTimeRemaining(state.myNote.expiresAt)}</p>
              </div>
            </div>
            <button onClick={deleteMyNote} className="absolute top-3 right-3 text-gray-500 hover:text-red-400 text-xs">Delete</button>
          </div>
        ) : (
          <button
            onClick={() => setState(prev => ({ ...prev, composing: true }))}
            className="w-full bg-gray-900 rounded-2xl p-4 flex items-center space-x-3 hover:bg-gray-800 transition-colors"
          >
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-gray-400 text-xl">+</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-300">Leave a note...</p>
              <p className="text-xs text-gray-500">Share what is on your mind</p>
            </div>
          </button>
        )}
      </section>

      {/* Friends Notes */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">FRIENDS' NOTES</h2>
        <div className="space-y-4">
          {state.notes.map(note => (
            <div key={note.id} className="flex items-start space-x-3">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 p-0.5">
                  <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                    <img src={note.avatar} alt={note.username} className="w-full h-full object-cover" />
                  </div>
                </div>
                {note.emoji && (
                  <span className="absolute -bottom-1 -right-1 text-sm">{note.emoji}</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">@{note.username}</p>
                <div className="bg-gray-900 rounded-xl px-3 py-2 inline-block relative">
                  <p className="text-sm text-white">{note.text}</p>
                  <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 rotate-45" />
                </div>
                <p className="text-xs text-gray-600 mt-1">{getTimeRemaining(note.expiresAt)}</p>
              </div>
            </div>
          ))}
        </div>

        {state.notes.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">💭</div>
            <p className="text-gray-400">No notes from friends</p>
            <p className="text-gray-500 text-xs mt-1">Notes from people you follow will appear here</p>
          </div>
        )}
      </section>

      {/* Compose Modal */}
      {state.composing && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 p-0.5 mx-auto">
                <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center">
                  {state.selectedEmoji ? (
                    <span className="text-3xl">{state.selectedEmoji}</span>
                  ) : (
                    <span className="text-gray-400 text-2xl">😊</span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mb-4">
              <input
                ref={inputRef}
                type="text"
                value={state.composeText}
                onChange={handleTextChange}
                maxLength={MAX_CHARS}
                placeholder="Share a thought..."
                className="w-full bg-gray-900 text-white text-center rounded-xl px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-pink-500"
              />
              <span className={`absolute right-3 bottom-2 text-xs ${state.charCount > 50 ? 'text-red-400' : 'text-gray-500'}`}>
                {state.charCount}/{MAX_CHARS}
              </span>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => selectEmoji(emoji)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                    state.selectedEmoji === emoji ? 'bg-pink-600 ring-2 ring-pink-400' : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >{emoji}</button>
              ))}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={publishNote}
                disabled={!state.composeText.trim()}
                className="flex-1 py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700 disabled:opacity-50"
              >Share Note</button>
              <button
                onClick={() => setState(prev => ({ ...prev, composing: false, composeText: '', selectedEmoji: null, charCount: 0 }))}
                className="flex-1 py-3 bg-gray-800 text-white rounded-xl"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPage;
