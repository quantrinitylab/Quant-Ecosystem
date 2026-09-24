'use client';

// ============================================================================
// QuantNeon - NotesTray Component
// Instagram 98-Screen Parity (Screens 22-26)
// Floating speech bubbles, 24h ephemeral notes, music badges, and modal editor.
// ============================================================================

import React, { useState } from 'react';
import {
  type UserNote,
  type MusicTrackAttachment,
  MAX_NOTE_LENGTH,
  validateNoteText,
  formatMusicBadge,
} from '../features/dm/notes-tray';

export interface NotesTrayProps {
  notes: UserNote[];
  onUpsertSelfNote: (text: string, musicTrack?: MusicTrackAttachment) => void;
  onRemoveSelfNote: () => void;
  onSelectFriendNote?: (note: UserNote) => void;
  selfUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
}

const SAMPLE_MUSIC_TRACKS: MusicTrackAttachment[] = [
  { id: 'm1', title: 'Starboy', artist: 'The Weeknd ft. Daft Punk' },
  { id: 'm2', title: 'Midnight City', artist: 'M83' },
  { id: 'm3', title: 'Blinding Lights', artist: 'The Weeknd' },
  { id: 'm4', title: 'Cyberpunk Theme', artist: 'Quant Trinity' },
];

export const NotesTray: React.FC<NotesTrayProps> = ({
  notes,
  onUpsertSelfNote,
  onRemoveSelfNote,
  onSelectFriendNote,
  selfUser,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [selectedMusic, setSelectedMusic] = useState<MusicTrackAttachment | undefined>(undefined);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [activeFriendNote, setActiveFriendNote] = useState<UserNote | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [replySent, setReplySent] = useState(false);

  const selfNote = notes.find((n) => n.isSelf || n.userId === selfUser.id);
  const friendNotes = notes.filter((n) => !n.isSelf && n.userId !== selfUser.id);

  const validation = validateNoteText(noteInput);

  const handleOpenEditor = () => {
    setNoteInput(selfNote ? selfNote.noteText : '');
    setSelectedMusic(selfNote?.musicTrack);
    setIsEditorOpen(true);
  };

  const handleSaveNote = () => {
    if (!validation.valid) return;
    onUpsertSelfNote(noteInput, selectedMusic);
    setIsEditorOpen(false);
  };

  const handleSendReply = () => {
    if (!replyInput.trim()) return;
    setReplySent(true);
    setTimeout(() => {
      setReplySent(false);
      setActiveFriendNote(null);
      setReplyInput('');
    }, 1200);
  };

  return (
    <div className="w-full border-b border-gray-800/80 bg-black/40 py-3 px-3">
      {/* Horizontal Tray Scroll */}
      <div className="flex items-start space-x-4 overflow-x-auto no-scrollbar pb-1">
        {/* User's Note Column */}
        <div
          className="flex flex-col items-center flex-shrink-0 cursor-pointer group"
          onClick={handleOpenEditor}
        >
          <div className="relative mb-1 flex flex-col items-center">
            {selfNote ? (
              <div className="mb-1 max-w-[96px] bg-gray-800/90 border border-gray-700 text-white rounded-2xl px-2.5 py-1 text-center shadow-lg transform -translate-y-1">
                <p className="text-[11px] font-medium leading-snug line-clamp-2">
                  {selfNote.noteText}
                </p>
                {selfNote.musicTrack && (
                  <div className="mt-0.5 flex items-center justify-center space-x-1 text-[9px] text-pink-400">
                    <span>🎵</span>
                    <span className="truncate max-w-[70px]">{selfNote.musicTrack.title}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-1 bg-gray-900 border border-dashed border-gray-700 text-gray-400 rounded-full px-2 py-0.5 text-[10px]">
                Share a thought...
              </div>
            )}

            <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-gray-800 group-hover:border-pink-500 transition-colors">
              <img
                src={
                  selfUser.avatarUrl ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'
                }
                alt={selfUser.displayName}
                className="w-full h-full object-cover"
              />
              {!selfNote && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold shadow-md">
                    +
                  </div>
                </div>
              )}
            </div>
          </div>
          <span className="text-[11px] text-gray-400 truncate max-w-[72px]">Your note</span>
        </div>

        {/* Friends' Notes Columns */}
        {friendNotes.map((note) => (
          <div
            key={note.id}
            onClick={() => {
              setActiveFriendNote(note);
              onSelectFriendNote?.(note);
            }}
            className="flex flex-col items-center flex-shrink-0 cursor-pointer group"
          >
            <div className="relative mb-1 flex flex-col items-center">
              <div className="mb-1 max-w-[96px] bg-gray-800/90 border border-gray-700 text-white rounded-2xl px-2.5 py-1 text-center shadow-lg transform -translate-y-1 group-hover:border-pink-500/60 transition-colors">
                <p className="text-[11px] font-medium leading-snug line-clamp-2">{note.noteText}</p>
                {note.musicTrack && (
                  <div className="mt-0.5 flex items-center justify-center space-x-1 text-[9px] text-pink-400">
                    <span>🎵</span>
                    <span className="truncate max-w-[70px]">{note.musicTrack.title}</span>
                  </div>
                )}
              </div>

              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-black">
                  <img
                    src={note.avatarUrl}
                    alt={note.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
            <span className="text-[11px] text-gray-300 font-medium truncate max-w-[72px]">
              {note.username}
            </span>
          </div>
        ))}
      </div>

      {/* Self Note Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#161B22] border border-gray-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {selfNote ? 'Edit your note' : 'Share a thought...'}
              </h3>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                placeholder="What's on your mind? (Visible for 24h)"
                rows={3}
                className="w-full bg-black/60 border border-gray-700 rounded-2xl p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 resize-none"
              />
              <div className="flex justify-between items-center text-xs">
                <span
                  className={
                    validation.remainingChars < 10 ? 'text-yellow-400 font-medium' : 'text-gray-500'
                  }
                >
                  {validation.remainingChars} characters left
                </span>
                <button
                  type="button"
                  onClick={() => setShowMusicPicker(!showMusicPicker)}
                  className="text-xs text-pink-400 hover:text-pink-300 flex items-center space-x-1"
                >
                  <span>🎵</span>
                  <span>{selectedMusic ? 'Change Song' : 'Add Music'}</span>
                </button>
              </div>
            </div>

            {/* Selected Music Badge */}
            {selectedMusic && (
              <div className="flex items-center justify-between bg-pink-950/40 border border-pink-800/40 rounded-xl px-3 py-2 text-xs text-pink-200">
                <div className="flex items-center space-x-2 truncate">
                  <span>🎵</span>
                  <span className="truncate">{formatMusicBadge(selectedMusic)}</span>
                </div>
                <button
                  onClick={() => setSelectedMusic(undefined)}
                  className="text-pink-400 hover:text-white font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Music Picker Dropdown */}
            {showMusicPicker && (
              <div className="space-y-1 bg-black/60 border border-gray-800 rounded-xl p-2 max-h-36 overflow-y-auto">
                <p className="text-[11px] font-semibold text-gray-400 px-1 mb-1">Select a Track</p>
                {SAMPLE_MUSIC_TRACKS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedMusic(t);
                      setShowMusicPicker(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-gray-800 text-gray-200 flex items-center justify-between"
                  >
                    <span className="truncate">
                      {t.title} - {t.artist}
                    </span>
                    <span className="text-[10px] text-pink-400 font-mono">Use</span>
                  </button>
                ))}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              {selfNote ? (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveSelfNote();
                    setIsEditorOpen(false);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Delete note
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!validation.valid}
                  onClick={handleSaveNote}
                  className="px-4 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-xs font-semibold rounded-full shadow-lg"
                >
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Friend Note Quick Reply Sheet */}
      {activeFriendNote && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#161B22] border border-gray-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <img
                  src={activeFriendNote.avatarUrl}
                  alt={activeFriendNote.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    {activeFriendNote.displayName}
                  </h4>
                  <p className="text-[10px] text-gray-400">@{activeFriendNote.username}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveFriendNote(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
              <p className="text-sm text-white font-medium">"{activeFriendNote.noteText}"</p>
              {activeFriendNote.musicTrack && (
                <div className="mt-2 text-xs text-pink-400 flex items-center justify-center space-x-1">
                  <span>🎵</span>
                  <span>{formatMusicBadge(activeFriendNote.musicTrack)}</span>
                </div>
              )}
            </div>

            {replySent ? (
              <div className="text-center py-2 text-sm text-emerald-400 font-medium">
                ✓ Reply sent to {activeFriendNote.username}!
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  placeholder={`Reply to ${activeFriendNote.username}...`}
                  className="flex-1 bg-black/60 border border-gray-700 rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyInput.trim()}
                  className="px-3 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-full text-xs font-semibold"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
