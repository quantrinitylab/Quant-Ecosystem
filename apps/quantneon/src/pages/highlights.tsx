// ============================================================================
// QuantNeon - Highlights Management
// Create from stories, cover image, reorder highlights
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Highlight {
  id: string;
  title: string;
  coverUrl: string;
  storyCount: number;
  stories: HighlightStory[];
  createdAt: string;
  updatedAt: string;
}

interface HighlightStory {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  addedAt: string;
}

interface AvailableStory {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  isSelected: boolean;
}

interface HighlightsPageState {
  highlights: Highlight[];
  availableStories: AvailableStory[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  editing: string | null;
  newTitle: string;
  newCoverUrl: string;
  selectedStories: Set<string>;
  reordering: boolean;
  draggedIndex: number | null;
}

const MOCK_HIGHLIGHTS: Highlight[] = [
  { id: 'h1', title: 'Travel', coverUrl: '/highlights/travel.jpg', storyCount: 24, stories: [{ id: 's1', mediaUrl: '/stories/travel1.jpg', mediaType: 'image', addedAt: '2024-01-14T10:00:00Z' }], createdAt: '2023-06-01', updatedAt: '2024-01-14' },
  { id: 'h2', title: 'Food', coverUrl: '/highlights/food.jpg', storyCount: 18, stories: [{ id: 's2', mediaUrl: '/stories/food1.jpg', mediaType: 'image', addedAt: '2024-01-13T10:00:00Z' }], createdAt: '2023-08-15', updatedAt: '2024-01-13' },
  { id: 'h3', title: 'Friends', coverUrl: '/highlights/friends.jpg', storyCount: 32, stories: [], createdAt: '2023-04-20', updatedAt: '2024-01-12' },
  { id: 'h4', title: 'Fitness', coverUrl: '/highlights/fitness.jpg', storyCount: 15, stories: [], createdAt: '2023-10-01', updatedAt: '2024-01-10' },
  { id: 'h5', title: 'Art', coverUrl: '/highlights/art.jpg', storyCount: 9, stories: [], createdAt: '2023-12-01', updatedAt: '2024-01-08' },
];

const MOCK_AVAILABLE: AvailableStory[] = [
  { id: 'as1', mediaUrl: '/stories/recent1.jpg', mediaType: 'image', createdAt: '2024-01-15T10:00:00Z', isSelected: false },
  { id: 'as2', mediaUrl: '/stories/recent2.jpg', mediaType: 'image', createdAt: '2024-01-15T08:00:00Z', isSelected: false },
  { id: 'as3', mediaUrl: '/stories/recent3.mp4', mediaType: 'video', createdAt: '2024-01-14T20:00:00Z', isSelected: false },
  { id: 'as4', mediaUrl: '/stories/recent4.jpg', mediaType: 'image', createdAt: '2024-01-14T16:00:00Z', isSelected: false },
  { id: 'as5', mediaUrl: '/stories/recent5.jpg', mediaType: 'image', createdAt: '2024-01-14T12:00:00Z', isSelected: false },
  { id: 'as6', mediaUrl: '/stories/recent6.mp4', mediaType: 'video', createdAt: '2024-01-13T18:00:00Z', isSelected: false },
];

const HighlightsPage: React.FC = () => {
  const [state, setState] = useState<HighlightsPageState>({
    highlights: [],
    availableStories: [],
    loading: true,
    error: null,
    creating: false,
    editing: null,
    newTitle: '',
    newCoverUrl: '',
    selectedStories: new Set(),
    reordering: false,
    draggedIndex: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 400));
        setState(prev => ({ ...prev, highlights: MOCK_HIGHLIGHTS, availableStories: MOCK_AVAILABLE, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load highlights', loading: false }));
      }
    };
    load();
  }, []);

  const startCreating = useCallback(() => {
    setState(prev => ({ ...prev, creating: true, newTitle: '', selectedStories: new Set() }));
  }, []);

  const cancelCreating = useCallback(() => {
    setState(prev => ({ ...prev, creating: false, editing: null }));
  }, []);

  const toggleStorySelection = useCallback((storyId: string) => {
    setState(prev => {
      const newSet = new Set(prev.selectedStories);
      if (newSet.has(storyId)) newSet.delete(storyId);
      else newSet.add(storyId);
      return { ...prev, selectedStories: newSet };
    });
  }, []);

  const createHighlight = useCallback(() => {
    if (!state.newTitle.trim() || state.selectedStories.size === 0) return;
    const newHighlight: Highlight = {
      id: `h_${Date.now()}`,
      title: state.newTitle,
      coverUrl: state.availableStories.find(s => state.selectedStories.has(s.id))?.mediaUrl || '/highlights/default.jpg',
      storyCount: state.selectedStories.size,
      stories: Array.from(state.selectedStories).map(id => ({ id, mediaUrl: state.availableStories.find(s => s.id === id)?.mediaUrl || '', mediaType: 'image' as const, addedAt: new Date().toISOString() })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, highlights: [...prev.highlights, newHighlight], creating: false, newTitle: '', selectedStories: new Set() }));
  }, [state.newTitle, state.selectedStories, state.availableStories]);

  const deleteHighlight = useCallback((highlightId: string) => {
    setState(prev => ({ ...prev, highlights: prev.highlights.filter(h => h.id !== highlightId) }));
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setState(prev => ({ ...prev, draggedIndex: index }));
  }, []);

  const handleDragEnd = useCallback((targetIndex: number) => {
    setState(prev => {
      if (prev.draggedIndex === null) return prev;
      const newHighlights = [...prev.highlights];
      const [removed] = newHighlights.splice(prev.draggedIndex, 1);
      newHighlights.splice(targetIndex, 0, removed);
      return { ...prev, highlights: newHighlights, draggedIndex: null };
    });
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
        <h1 className="text-xl font-bold">Highlights</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setState(prev => ({ ...prev, reordering: !prev.reordering }))}
            className={`px-3 py-1.5 rounded-lg text-xs ${state.reordering ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >{state.reordering ? 'Done' : 'Reorder'}</button>
          <button onClick={startCreating} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">+ New</button>
        </div>
      </header>

      {/* Highlights Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 mt-4">
        {state.highlights.map((highlight, idx) => (
          <div
            key={highlight.id}
            draggable={state.reordering}
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDragEnd(idx)}
            className={`relative group cursor-pointer ${state.reordering ? 'animate-pulse' : ''}`}
          >
            <div className="w-full aspect-square rounded-full bg-gradient-to-br from-pink-500 to-purple-600 p-0.5">
              <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden p-0.5">
                <img src={highlight.coverUrl} alt={highlight.title} className="w-full h-full rounded-full object-cover" />
              </div>
            </div>
            <p className="text-center text-xs mt-2 truncate">{highlight.title}</p>
            <p className="text-center text-xs text-gray-500">{highlight.storyCount} stories</p>
            {state.reordering && (
              <button
                onClick={() => deleteHighlight(highlight.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white"
              >✕</button>
            )}
          </div>
        ))}
      </div>

      {state.highlights.length === 0 && !state.creating && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-white font-semibold">No Highlights Yet</p>
          <p className="text-gray-400 text-sm mt-1">Create highlights from your stories</p>
          <button onClick={startCreating} className="mt-4 px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Create First Highlight</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {state.creating && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Highlight</h2>
              <button onClick={cancelCreating} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <input
              type="text"
              value={state.newTitle}
              onChange={(e) => setState(prev => ({ ...prev, newTitle: e.target.value }))}
              placeholder="Highlight name..."
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-pink-500 mb-4"
            />
            <p className="text-sm text-gray-400 mb-3">Select stories ({state.selectedStories.size} selected)</p>
            <div className="grid grid-cols-3 gap-2 flex-1 overflow-y-auto">
              {state.availableStories.map(story => (
                <div
                  key={story.id}
                  onClick={() => toggleStorySelection(story.id)}
                  className={`relative aspect-[9/16] rounded-lg overflow-hidden cursor-pointer border-2 ${
                    state.selectedStories.has(story.id) ? 'border-pink-500' : 'border-transparent'
                  }`}
                >
                  <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
                  {story.mediaType === 'video' && <span className="absolute top-1 right-1 text-xs">🎬</span>}
                  {state.selectedStories.has(story.id) && (
                    <div className="absolute top-1 left-1 w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-xs text-white">✓</div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={createHighlight}
              disabled={!state.newTitle.trim() || state.selectedStories.size === 0}
              className="w-full mt-4 py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700 disabled:opacity-50"
            >
              Create Highlight
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HighlightsPage;
