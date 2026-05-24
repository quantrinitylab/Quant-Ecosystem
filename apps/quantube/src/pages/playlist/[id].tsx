// ============================================================================
// QuantTube - Playlist View
// Playlist header, video list with drag-reorder, collaborative editing, share
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface PlaylistData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorName: string;
  creatorAvatar: string;
  videoCount: number;
  totalDuration: number;
  isPublic: boolean;
  collaborative: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistVideo {
  id: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: number;
  views: number;
  addedAt: string;
  position: number;
}

interface ShareModalState {
  isOpen: boolean;
  copied: boolean;
  shareUrl: string;
}

interface PlaylistPageState {
  playlist: PlaylistData | null;
  videos: PlaylistVideo[];
  editMode: boolean;
  collaborative: boolean;
  shareModalOpen: ShareModalState;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  loading: boolean;
  error: string | null;
  editingTitle: boolean;
  editingDescription: boolean;
  titleDraft: string;
  descriptionDraft: string;
  searchQuery: string;
  showAddVideos: boolean;
  confirmDelete: boolean;
}

const MOCK_PLAYLIST: PlaylistData = {
  id: 'pl-123',
  title: 'Web Development Masterclass',
  description: 'A curated collection of the best web development tutorials covering React, TypeScript, Node.js, and modern CSS. Updated weekly with new content.',
  coverUrl: '/covers/webdev-playlist.jpg',
  creatorName: 'CodeMaster',
  creatorAvatar: '/avatars/codemaster.jpg',
  videoCount: 12,
  totalDuration: 28800,
  isPublic: true,
  collaborative: false,
  createdAt: '2023-11-01T10:00:00Z',
  updatedAt: '2024-01-14T15:30:00Z',
};

const MOCK_VIDEOS: PlaylistVideo[] = [
  { id: 'v1', title: 'React 19 Complete Guide - Everything New', channelName: 'ReactMasters', thumbnailUrl: '/thumbs/react19.jpg', duration: 3600, views: 245000, addedAt: '2024-01-14T10:00:00Z', position: 1 },
  { id: 'v2', title: 'TypeScript 5.4 - Advanced Types Deep Dive', channelName: 'TSPro', thumbnailUrl: '/thumbs/ts54.jpg', duration: 2700, views: 189000, addedAt: '2024-01-13T09:00:00Z', position: 2 },
  { id: 'v3', title: 'Building a Full-Stack App with Next.js 14', channelName: 'WebDevSimplified', thumbnailUrl: '/thumbs/nextjs14.jpg', duration: 5400, views: 312000, addedAt: '2024-01-12T14:00:00Z', position: 3 },
  { id: 'v4', title: 'CSS Container Queries - The Future is Here', channelName: 'CSSWizardry', thumbnailUrl: '/thumbs/css-cq.jpg', duration: 1800, views: 98000, addedAt: '2024-01-11T11:00:00Z', position: 4 },
  { id: 'v5', title: 'Node.js Performance Optimization Techniques', channelName: 'NodeNinja', thumbnailUrl: '/thumbs/node-perf.jpg', duration: 2400, views: 156000, addedAt: '2024-01-10T08:00:00Z', position: 5 },
  { id: 'v6', title: 'Tailwind CSS v4 - Complete Migration Guide', channelName: 'TailwindLabs', thumbnailUrl: '/thumbs/tw4.jpg', duration: 1200, views: 423000, addedAt: '2024-01-09T16:00:00Z', position: 6 },
  { id: 'v7', title: 'GraphQL vs REST - Which to Choose in 2024', channelName: 'APIDesign', thumbnailUrl: '/thumbs/graphql-rest.jpg', duration: 2100, views: 87000, addedAt: '2024-01-08T12:00:00Z', position: 7 },
  { id: 'v8', title: 'Docker for Frontend Developers', channelName: 'DevOpsJourney', thumbnailUrl: '/thumbs/docker-fe.jpg', duration: 3000, views: 134000, addedAt: '2024-01-07T10:00:00Z', position: 8 },
  { id: 'v9', title: 'Testing React Apps - Vitest & Testing Library', channelName: 'TestingJS', thumbnailUrl: '/thumbs/testing.jpg', duration: 2400, views: 76000, addedAt: '2024-01-06T09:00:00Z', position: 9 },
  { id: 'v10', title: 'Zustand vs Redux Toolkit - State Management Battle', channelName: 'ReactMasters', thumbnailUrl: '/thumbs/zustand.jpg', duration: 1800, views: 201000, addedAt: '2024-01-05T14:00:00Z', position: 10 },
  { id: 'v11', title: 'Web Animations API - No Library Needed', channelName: 'CSSWizardry', thumbnailUrl: '/thumbs/waapi.jpg', duration: 1500, views: 54000, addedAt: '2024-01-04T11:00:00Z', position: 11 },
  { id: 'v12', title: 'Deploying to the Edge with Vercel', channelName: 'CloudDeploy', thumbnailUrl: '/thumbs/vercel-edge.jpg', duration: 900, views: 167000, addedAt: '2024-01-03T08:00:00Z', position: 12 },
];

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTotalDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

const formatViews = (views: number): string => {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
  if (views >= 1000) return `${(views / 1000).toFixed(0)}K views`;
  return `${views} views`;
};

const PlaylistPage: React.FC = () => {
  const [state, setState] = useState<PlaylistPageState>({
    playlist: null,
    videos: [],
    editMode: false,
    collaborative: false,
    shareModalOpen: { isOpen: false, copied: false, shareUrl: '' },
    draggedIndex: null,
    dragOverIndex: null,
    loading: true,
    error: null,
    editingTitle: false,
    editingDescription: false,
    titleDraft: '',
    descriptionDraft: '',
    searchQuery: '',
    showAddVideos: false,
    confirmDelete: false,
  });

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        await new Promise(resolve => setTimeout(resolve, 600));
        setState(prev => ({
          ...prev,
          playlist: MOCK_PLAYLIST,
          videos: MOCK_VIDEOS,
          collaborative: MOCK_PLAYLIST.collaborative,
          titleDraft: MOCK_PLAYLIST.title,
          descriptionDraft: MOCK_PLAYLIST.description,
          loading: false,
        }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load playlist', loading: false }));
      }
    };
    loadPlaylist();
  }, []);

  useEffect(() => {
    if (state.editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [state.editingTitle]);

  const toggleEditMode = useCallback(() => {
    setState(prev => ({ ...prev, editMode: !prev.editMode }));
  }, []);

  const toggleCollaborative = useCallback(() => {
    setState(prev => ({ ...prev, collaborative: !prev.collaborative }));
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setState(prev => ({ ...prev, draggedIndex: index }));
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setState(prev => ({ ...prev, dragOverIndex: index }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setState(prev => {
      if (prev.draggedIndex === null || prev.dragOverIndex === null) {
        return { ...prev, draggedIndex: null, dragOverIndex: null };
      }
      const newVideos = [...prev.videos];
      const [removed] = newVideos.splice(prev.draggedIndex, 1);
      newVideos.splice(prev.dragOverIndex, 0, removed);
      const reindexed = newVideos.map((v, idx) => ({ ...v, position: idx + 1 }));
      return { ...prev, videos: reindexed, draggedIndex: null, dragOverIndex: null };
    });
  }, []);

  const removeVideo = useCallback((videoId: string) => {
    setState(prev => ({
      ...prev,
      videos: prev.videos.filter(v => v.id !== videoId).map((v, idx) => ({ ...v, position: idx + 1 })),
    }));
  }, []);

  const saveTitle = useCallback(() => {
    setState(prev => ({
      ...prev,
      playlist: prev.playlist ? { ...prev.playlist, title: prev.titleDraft } : null,
      editingTitle: false,
    }));
  }, []);

  const saveDescription = useCallback(() => {
    setState(prev => ({
      ...prev,
      playlist: prev.playlist ? { ...prev.playlist, description: prev.descriptionDraft } : null,
      editingDescription: false,
    }));
  }, []);

  const openShareModal = useCallback(() => {
    const url = `https://quantube.app/playlist/${state.playlist?.id || ''}`;
    setState(prev => ({
      ...prev,
      shareModalOpen: { isOpen: true, copied: false, shareUrl: url },
    }));
  }, [state.playlist?.id]);

  const closeShareModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      shareModalOpen: { ...prev.shareModalOpen, isOpen: false },
    }));
  }, []);

  const copyShareLink = useCallback(() => {
    setState(prev => ({
      ...prev,
      shareModalOpen: { ...prev.shareModalOpen, copied: true },
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        shareModalOpen: { ...prev.shareModalOpen, copied: false },
      }));
    }, 2000);
  }, []);

  const handleDeletePlaylist = useCallback(() => {
    setState(prev => ({ ...prev, confirmDelete: true }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠</div>
          <p className="text-white text-lg">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state.playlist) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-6xl">📋</div>
          <p className="text-white text-xl font-semibold">Playlist Not Found</p>
          <p className="text-gray-400 text-sm">This playlist may have been deleted or made private.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Playlist Header */}
      <section className="bg-gradient-to-b from-blue-900/30 to-gray-950 px-6 py-8">
        <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-6">
          {/* Cover Image */}
          <div className="w-48 h-48 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0 shadow-xl">
            <img src={state.playlist.coverUrl} alt={state.playlist.title} className="w-full h-full object-cover" />
          </div>
          {/* Info */}
          <div className="flex-1">
            {state.editingTitle ? (
              <div className="flex items-center space-x-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={state.titleDraft}
                  onChange={(e) => setState(prev => ({ ...prev, titleDraft: e.target.value }))}
                  onBlur={saveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                  className="text-2xl font-bold bg-gray-800 text-white rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-blue-500 w-full"
                />
              </div>
            ) : (
              <h1
                className="text-2xl md:text-3xl font-bold cursor-pointer hover:text-blue-300 transition-colors"
                onClick={() => state.editMode && setState(prev => ({ ...prev, editingTitle: true }))}
              >
                {state.playlist.title}
                {state.editMode && <span className="text-blue-400 text-sm ml-2">✎</span>}
              </h1>
            )}

            {/* Creator */}
            <div className="flex items-center space-x-2 mt-2">
              <div className="w-6 h-6 rounded-full bg-gray-600 overflow-hidden">
                <img src={state.playlist.creatorAvatar} alt={state.playlist.creatorName} className="w-full h-full object-cover" />
              </div>
              <span className="text-sm text-gray-300">{state.playlist.creatorName}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center space-x-4 mt-3 text-sm text-gray-400">
              <span>{state.videos.length} videos</span>
              <span>{formatTotalDuration(state.playlist.totalDuration)}</span>
              <span>Updated {new Date(state.playlist.updatedAt).toLocaleDateString()}</span>
            </div>

            {/* Description */}
            {state.editingDescription ? (
              <textarea
                ref={descInputRef}
                value={state.descriptionDraft}
                onChange={(e) => setState(prev => ({ ...prev, descriptionDraft: e.target.value }))}
                onBlur={saveDescription}
                className="mt-3 w-full bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20"
              />
            ) : (
              <p
                className="text-gray-400 text-sm mt-3 line-clamp-3 cursor-pointer"
                onClick={() => state.editMode && setState(prev => ({ ...prev, editingDescription: true }))}
              >
                {state.playlist.description}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button className="px-6 py-2.5 bg-white text-black rounded-full font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center space-x-2">
            <span>▶</span>
            <span>Play All</span>
          </button>
          <button className="px-5 py-2.5 bg-gray-800 text-white rounded-full text-sm hover:bg-gray-700 transition-colors flex items-center space-x-2">
            <span>🔀</span>
            <span>Shuffle</span>
          </button>
          <button
            onClick={openShareModal}
            className="px-5 py-2.5 bg-gray-800 text-white rounded-full text-sm hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <span>↗</span>
            <span>Share</span>
          </button>
          <button
            onClick={toggleEditMode}
            className={`px-5 py-2.5 rounded-full text-sm transition-colors flex items-center space-x-2 ${
              state.editMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            <span>✎</span>
            <span>{state.editMode ? 'Done' : 'Edit'}</span>
          </button>
          <button
            onClick={handleDeletePlaylist}
            className="px-5 py-2.5 bg-red-900/30 text-red-400 border border-red-600/30 rounded-full text-sm hover:bg-red-900/50 transition-colors"
          >
            Delete
          </button>
        </div>

        {/* Collaborative Toggle */}
        <div className="flex items-center space-x-3 mt-4">
          <label className="text-sm text-gray-400">Collaborative:</label>
          <button
            onClick={toggleCollaborative}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              state.collaborative ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              state.collaborative ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-xs text-gray-500">
            {state.collaborative ? 'Anyone with link can add videos' : 'Only you can edit'}
          </span>
        </div>
      </section>

      {/* Add Videos Search */}
      {state.editMode && (
        <section className="px-6 py-4">
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={state.searchQuery}
                onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
                placeholder="Search for videos to add..."
                className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                Search
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Video List */}
      <section className="px-6 py-4">
        <div className="space-y-2">
          {state.videos.map((video, idx) => (
            <div
              key={video.id}
              draggable={state.editMode}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
              onDragEnd={handleDragEnd}
              className={`flex items-center space-x-3 p-3 rounded-xl transition-colors group ${
                state.dragOverIndex === idx ? 'bg-blue-900/30 border border-blue-500/30' : 'hover:bg-gray-900'
              } ${state.draggedIndex === idx ? 'opacity-50' : ''}`}
            >
              {/* Drag Handle / Position */}
              <div className="flex items-center w-8 flex-shrink-0">
                {state.editMode ? (
                  <span className="text-gray-500 cursor-grab active:cursor-grabbing text-lg">⋮⋮</span>
                ) : (
                  <span className="text-gray-500 text-sm">{video.position}</span>
                )}
              </div>

              {/* Thumbnail */}
              <div className="relative w-28 h-16 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
                <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
                  {formatDuration(video.duration)}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate hover:text-blue-300 cursor-pointer">{video.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{video.channelName}</p>
                <p className="text-xs text-gray-500">{formatViews(video.views)}</p>
              </div>

              {/* Remove Button */}
              {state.editMode && (
                <button
                  onClick={() => removeVideo(video.id)}
                  className="text-gray-500 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {state.videos.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-white text-lg font-semibold">This playlist is empty</p>
            <p className="text-gray-400 text-sm mt-2">Add videos to start building your playlist</p>
            <button
              onClick={toggleEditMode}
              className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              Add Videos
            </button>
          </div>
        )}
      </section>

      {/* Share Modal */}
      {state.shareModalOpen.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Share Playlist</h3>
              <button onClick={closeShareModal} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={state.shareModalOpen.shareUrl}
                readOnly
                className="flex-1 bg-gray-800 text-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={copyShareLink}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  state.shareModalOpen.copied
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {state.shareModalOpen.copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <button className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-800">
                <span className="text-2xl">💬</span>
                <span className="text-xs text-gray-400">Message</span>
              </button>
              <button className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-800">
                <span className="text-2xl">📧</span>
                <span className="text-xs text-gray-400">Email</span>
              </button>
              <button className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-800">
                <span className="text-2xl">🐦</span>
                <span className="text-xs text-gray-400">Tweet</span>
              </button>
              <button className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-800">
                <span className="text-2xl">📎</span>
                <span className="text-xs text-gray-400">Embed</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {state.confirmDelete && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold">Delete Playlist?</h3>
            <p className="text-gray-400 text-sm">This action cannot be undone. All {state.videos.length} videos will be removed from this playlist.</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setState(prev => ({ ...prev, confirmDelete: false }))}
                className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaylistPage;
