// ============================================================================
// QuantTube - Chapter Editor Component
// Video chapters editor with timestamp markers and drag reorder
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  thumbnailUrl: string | null;
}

interface ChapterEditorProps {
  videoDuration: number;
  initialChapters?: Chapter[];
  onSave?: (chapters: Chapter[]) => void;
}

interface EditorState {
  chapters: Chapter[];
  editingId: string | null;
  editTitle: string;
  editStartTime: string;
  draggedId: string | null;
  previewTime: number | null;
  hasChanges: boolean;
}

const formatTimestamp = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const parseTimestamp = (str: string): number => {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

const MOCK_CHAPTERS: Chapter[] = [
  { id: 'ch1', title: 'Introduction', startTime: 0, endTime: 120, thumbnailUrl: '/thumbs/ch1.jpg' },
  { id: 'ch2', title: 'Setting Up the Project', startTime: 120, endTime: 480, thumbnailUrl: '/thumbs/ch2.jpg' },
  { id: 'ch3', title: 'Core Concepts', startTime: 480, endTime: 960, thumbnailUrl: '/thumbs/ch3.jpg' },
  { id: 'ch4', title: 'Building the UI', startTime: 960, endTime: 1560, thumbnailUrl: '/thumbs/ch4.jpg' },
  { id: 'ch5', title: 'State Management', startTime: 1560, endTime: 2100, thumbnailUrl: '/thumbs/ch5.jpg' },
  { id: 'ch6', title: 'API Integration', startTime: 2100, endTime: 2700, thumbnailUrl: '/thumbs/ch6.jpg' },
  { id: 'ch7', title: 'Testing & Deployment', startTime: 2700, endTime: 3300, thumbnailUrl: '/thumbs/ch7.jpg' },
  { id: 'ch8', title: 'Conclusion & Next Steps', startTime: 3300, endTime: 3600, thumbnailUrl: '/thumbs/ch8.jpg' },
];

const ChapterEditor: React.FC<ChapterEditorProps> = ({ videoDuration = 3600, initialChapters, onSave }) => {
  const [state, setState] = useState<EditorState>({
    chapters: initialChapters || MOCK_CHAPTERS,
    editingId: null,
    editTitle: '',
    editStartTime: '',
    draggedId: null,
    previewTime: null,
    hasChanges: false,
  });

  const timelineRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback((chapter: Chapter) => {
    setState(prev => ({
      ...prev,
      editingId: chapter.id,
      editTitle: chapter.title,
      editStartTime: formatTimestamp(chapter.startTime),
    }));
  }, []);

  const saveEditing = useCallback(() => {
    setState(prev => {
      if (!prev.editingId) return prev;
      const newStart = parseTimestamp(prev.editStartTime);
      return {
        ...prev,
        chapters: prev.chapters.map(ch =>
          ch.id === prev.editingId ? { ...ch, title: prev.editTitle, startTime: newStart } : ch
        ).sort((a, b) => a.startTime - b.startTime),
        editingId: null,
        hasChanges: true,
      };
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setState(prev => ({ ...prev, editingId: null }));
  }, []);

  const addChapter = useCallback(() => {
    const lastChapter = state.chapters[state.chapters.length - 1];
    const newStart = lastChapter ? lastChapter.endTime : 0;
    const newChapter: Chapter = {
      id: `ch-${Date.now()}`,
      title: 'New Chapter',
      startTime: newStart,
      endTime: Math.min(newStart + 300, videoDuration),
      thumbnailUrl: null,
    };
    setState(prev => ({
      ...prev,
      chapters: [...prev.chapters, newChapter].sort((a, b) => a.startTime - b.startTime),
      hasChanges: true,
    }));
  }, [state.chapters, videoDuration]);

  const deleteChapter = useCallback((chapterId: string) => {
    setState(prev => ({
      ...prev,
      chapters: prev.chapters.filter(ch => ch.id !== chapterId),
      hasChanges: true,
    }));
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * videoDuration;
    setState(prev => ({ ...prev, previewTime: time }));
  }, [videoDuration]);

  const handleSave = useCallback(() => {
    if (onSave) onSave(state.chapters);
    setState(prev => ({ ...prev, hasChanges: false }));
  }, [state.chapters, onSave]);

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Chapters ({state.chapters.length})</h3>
        <div className="flex items-center space-x-2">
          <button onClick={addChapter} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
            + Add Chapter
          </button>
          {state.hasChanges && (
            <button onClick={handleSave} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
              Save Changes
            </button>
          )}
        </div>
      </div>

      {/* Timeline Visualization */}
      <div
        ref={timelineRef}
        className="relative h-10 bg-gray-800 rounded-lg cursor-pointer overflow-hidden"
        onClick={handleTimelineClick}
      >
        {state.chapters.map((chapter, idx) => {
          const left = (chapter.startTime / videoDuration) * 100;
          const width = ((chapter.endTime - chapter.startTime) / videoDuration) * 100;
          const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
          return (
            <div
              key={chapter.id}
              className={`absolute top-0 h-full ${colors[idx % colors.length]} opacity-60 hover:opacity-90 transition-opacity border-r border-gray-900`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${chapter.title} (${formatTimestamp(chapter.startTime)})`}
            />
          );
        })}
        {state.previewTime !== null && (
          <div className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${(state.previewTime / videoDuration) * 100}%` }} />
        )}
      </div>

      {/* Chapter List */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {state.chapters.map((chapter, idx) => (
          <div key={chapter.id} className={`flex items-center space-x-3 p-3 rounded-lg ${state.editingId === chapter.id ? 'bg-gray-800 ring-1 ring-blue-500' : 'bg-gray-800/50 hover:bg-gray-800'}`}>
            <span className="text-gray-500 text-sm w-6 text-center">{idx + 1}</span>
            <div className="w-16 h-9 bg-gray-700 rounded overflow-hidden flex-shrink-0">
              {chapter.thumbnailUrl && <img src={chapter.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            {state.editingId === chapter.id ? (
              <div className="flex-1 flex items-center space-x-2">
                <input
                  type="text"
                  value={state.editTitle}
                  onChange={(e) => setState(prev => ({ ...prev, editTitle: e.target.value }))}
                  className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={state.editStartTime}
                  onChange={(e) => setState(prev => ({ ...prev, editStartTime: e.target.value }))}
                  className="w-20 bg-gray-700 text-white rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0:00"
                />
                <button onClick={saveEditing} className="text-green-400 text-xs hover:text-green-300">Save</button>
                <button onClick={cancelEditing} className="text-gray-400 text-xs hover:text-white">Cancel</button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{chapter.title}</p>
                  <p className="text-xs text-gray-500">{formatTimestamp(chapter.startTime)} - {formatTimestamp(chapter.endTime)}</p>
                </div>
                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100">
                  <button onClick={() => startEditing(chapter)} className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-gray-700 rounded">Edit</button>
                  <button onClick={() => deleteChapter(chapter.id)} className="text-gray-400 hover:text-red-400 text-xs px-2 py-1 bg-gray-700 rounded">Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChapterEditor;
