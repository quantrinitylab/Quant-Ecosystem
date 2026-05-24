// ============================================================================
// QuantTube - Subtitle Editor Component
// Caption editor with timeline sync, multi-language support
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker: string | null;
}

interface SubtitleTrack {
  id: string;
  language: string;
  languageCode: string;
  isDefault: boolean;
  cues: SubtitleCue[];
  status: 'draft' | 'published' | 'auto-generated';
}

interface SubtitleEditorProps {
  videoId: string;
  videoDuration: number;
  onSave?: (track: SubtitleTrack) => void;
}

interface EditorState {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  editingCueId: string | null;
  editText: string;
  currentTime: number;
  loading: boolean;
  error: string | null;
  addingLanguage: boolean;
  newLanguage: string;
  searchQuery: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
];

const MOCK_CUES: SubtitleCue[] = [
  { id: 'cue1', startTime: 0, endTime: 3.5, text: 'Welcome to this tutorial on React hooks.', speaker: 'Host' },
  { id: 'cue2', startTime: 3.5, endTime: 7.2, text: 'Today we will cover useState, useEffect, and useCallback.', speaker: 'Host' },
  { id: 'cue3', startTime: 7.2, endTime: 11.0, text: 'Lets start with a basic example of useState.', speaker: 'Host' },
  { id: 'cue4', startTime: 11.0, endTime: 15.5, text: 'Import React and the useState hook from the react package.', speaker: 'Host' },
  { id: 'cue5', startTime: 15.5, endTime: 20.0, text: 'Create a functional component and declare your state variable.', speaker: 'Host' },
  { id: 'cue6', startTime: 20.0, endTime: 25.0, text: 'The useState hook returns an array with two elements.', speaker: 'Host' },
  { id: 'cue7', startTime: 25.0, endTime: 30.0, text: 'The current state value and a function to update it.', speaker: 'Host' },
  { id: 'cue8', startTime: 30.0, endTime: 35.0, text: 'Now lets look at useEffect for side effects.', speaker: 'Host' },
];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ videoId, videoDuration, onSave }) => {
  const [state, setState] = useState<EditorState>({
    tracks: [{
      id: 'track-en',
      language: 'English',
      languageCode: 'en',
      isDefault: true,
      cues: MOCK_CUES,
      status: 'auto-generated',
    }],
    activeTrackId: 'track-en',
    editingCueId: null,
    editText: '',
    currentTime: 0,
    loading: false,
    error: null,
    addingLanguage: false,
    newLanguage: '',
    searchQuery: '',
  });

  const cueListRef = useRef<HTMLDivElement>(null);

  const activeTrack = state.tracks.find(t => t.id === state.activeTrackId) || null;

  const selectTrack = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, activeTrackId: trackId, editingCueId: null }));
  }, []);

  const startEditCue = useCallback((cue: SubtitleCue) => {
    setState(prev => ({ ...prev, editingCueId: cue.id, editText: cue.text }));
  }, []);

  const saveCueEdit = useCallback(() => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === prev.activeTrackId
          ? { ...track, cues: track.cues.map(cue => cue.id === prev.editingCueId ? { ...cue, text: prev.editText } : cue) }
          : track
      ),
      editingCueId: null,
    }));
  }, []);

  const deleteCue = useCallback((cueId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === prev.activeTrackId
          ? { ...track, cues: track.cues.filter(c => c.id !== cueId) }
          : track
      ),
    }));
  }, []);

  const addCue = useCallback(() => {
    if (!activeTrack) return;
    const lastCue = activeTrack.cues[activeTrack.cues.length - 1];
    const startTime = lastCue ? lastCue.endTime : 0;
    const newCue: SubtitleCue = {
      id: `cue-${Date.now()}`,
      startTime,
      endTime: Math.min(startTime + 5, videoDuration),
      text: '',
      speaker: null,
    };
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === prev.activeTrackId ? { ...track, cues: [...track.cues, newCue] } : track
      ),
      editingCueId: newCue.id,
      editText: '',
    }));
  }, [activeTrack, videoDuration]);

  const addLanguageTrack = useCallback(() => {
    const lang = LANGUAGES.find(l => l.code === state.newLanguage);
    if (!lang) return;
    const newTrack: SubtitleTrack = {
      id: `track-${lang.code}`,
      language: lang.name,
      languageCode: lang.code,
      isDefault: false,
      cues: [],
      status: 'draft',
    };
    setState(prev => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      activeTrackId: newTrack.id,
      addingLanguage: false,
      newLanguage: '',
    }));
  }, [state.newLanguage]);

  const generateAutoSubtitles = useCallback(() => {
    setState(prev => ({ ...prev, loading: true }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        loading: false,
        tracks: prev.tracks.map(track =>
          track.id === prev.activeTrackId && track.cues.length === 0
            ? { ...track, cues: MOCK_CUES, status: 'auto-generated' }
            : track
        ),
      }));
    }, 2000);
  }, []);

  const handleSaveTrack = useCallback(() => {
    if (activeTrack && onSave) onSave(activeTrack);
  }, [activeTrack, onSave]);

  if (state.loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-8 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Generating subtitles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-800 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Subtitles & Captions</h3>
        <div className="flex items-center space-x-2">
          <button onClick={handleSaveTrack} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
            Publish
          </button>
        </div>
      </div>

      {/* Language Tabs */}
      <div className="flex items-center space-x-1 px-4 py-2 bg-gray-800/50 border-b border-gray-700 overflow-x-auto">
        {state.tracks.map(track => (
          <button
            key={track.id}
            onClick={() => selectTrack(track.id)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
              state.activeTrackId === track.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {track.language} ({track.cues.length})
          </button>
        ))}
        <button
          onClick={() => setState(prev => ({ ...prev, addingLanguage: true }))}
          className="px-2 py-1.5 text-gray-400 hover:text-white text-xs"
        >
          + Add Language
        </button>
      </div>

      {/* Add Language Form */}
      {state.addingLanguage && (
        <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-700 flex items-center space-x-2">
          <select
            value={state.newLanguage}
            onChange={(e) => setState(prev => ({ ...prev, newLanguage: e.target.value }))}
            className="bg-gray-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
          >
            <option value="">Select language...</option>
            {LANGUAGES.filter(l => !state.tracks.some(t => t.languageCode === l.code)).map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
          <button onClick={addLanguageTrack} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs">Add</button>
          <button onClick={() => setState(prev => ({ ...prev, addingLanguage: false }))} className="text-gray-400 text-xs">Cancel</button>
        </div>
      )}

      {/* Cue List */}
      <div ref={cueListRef} className="max-h-96 overflow-y-auto">
        {activeTrack && activeTrack.cues.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-gray-400 text-sm mb-3">No subtitles for this track yet</p>
            <div className="flex items-center justify-center space-x-3">
              <button onClick={generateAutoSubtitles} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
                Auto-Generate
              </button>
              <button onClick={addCue} className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
                Add Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {activeTrack?.cues.map((cue, idx) => (
              <div key={cue.id} className={`flex items-start space-x-3 px-4 py-3 hover:bg-gray-800/50 ${state.editingCueId === cue.id ? 'bg-gray-800' : ''}`}>
                <span className="text-gray-500 text-xs w-6 pt-1 text-right">{idx + 1}</span>
                <div className="text-xs text-gray-500 w-24 pt-1 flex-shrink-0">
                  <div>{formatTime(cue.startTime)}</div>
                  <div>{formatTime(cue.endTime)}</div>
                </div>
                <div className="flex-1">
                  {state.editingCueId === cue.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={state.editText}
                        onChange={(e) => setState(prev => ({ ...prev, editText: e.target.value }))}
                        className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none resize-none h-16 focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex space-x-2">
                        <button onClick={saveCueEdit} className="text-green-400 text-xs">Save</button>
                        <button onClick={() => setState(prev => ({ ...prev, editingCueId: null }))} className="text-gray-400 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-white text-sm cursor-pointer hover:text-blue-300" onClick={() => startEditCue(cue)}>
                      {cue.text || <span className="text-gray-500 italic">Empty subtitle</span>}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteCue(cue.id)} className="text-gray-600 hover:text-red-400 text-xs p-1">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {activeTrack && activeTrack.cues.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
          <button onClick={addCue} className="text-blue-400 text-xs hover:text-blue-300">+ Add Cue</button>
          <span className="text-gray-500 text-xs">{activeTrack.cues.length} cues | {activeTrack.status}</span>
        </div>
      )}
    </div>
  );
};

export default SubtitleEditor;
