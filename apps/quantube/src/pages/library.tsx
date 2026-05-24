// ============================================================================
// QuantTube - Library Page
// User library with history, playlists, downloads, watch later
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface HistoryItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  duration: number;
  watchedAt: string;
  progress: number;
}

interface PlaylistData {
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  visibility: 'public' | 'private' | 'unlisted';
  isSystem: boolean;
  updatedAt: string;
}

interface DownloadItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  quality: string;
  fileSize: number;
  downloadedAt: string;
  expiresAt: string;
}

interface WatchLaterItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  duration: number;
  addedAt: string;
}

type LibrarySection = 'history' | 'playlists' | 'downloads' | 'watchLater';

interface LibraryPageState {
  history: HistoryItem[];
  playlists: PlaylistData[];
  downloads: DownloadItem[];
  watchLater: WatchLaterItem[];
  activeSection: LibrarySection;
  loading: boolean;
  error: string | null;
  showCreatePlaylist: boolean;
  newPlaylistName: string;
}

const MOCK_HISTORY: HistoryItem[] = [
  { id: 'h1', videoId: 'v1', title: 'React Hooks Deep Dive - Complete Guide', thumbnail: '/thumbs/hooks.jpg', channelName: 'TechVision', duration: 2400, watchedAt: '2024-01-15T10:30:00Z', progress: 0.75 },
  { id: 'h2', videoId: 'v2', title: 'Building a Real-Time Chat App with WebSockets', thumbnail: '/thumbs/websocket.jpg', channelName: 'CodeMaster', duration: 3600, watchedAt: '2024-01-14T20:00:00Z', progress: 1.0 },
  { id: 'h3', videoId: 'v3', title: 'CSS Grid Layout Masterclass', thumbnail: '/thumbs/cssgrid.jpg', channelName: 'DesignDev', duration: 1800, watchedAt: '2024-01-14T15:00:00Z', progress: 0.45 },
  { id: 'h4', videoId: 'v4', title: 'Kubernetes for Beginners', thumbnail: '/thumbs/k8s.jpg', channelName: 'CloudPro', duration: 4200, watchedAt: '2024-01-13T11:00:00Z', progress: 0.3 },
  { id: 'h5', videoId: 'v5', title: 'Music Production with Ableton', thumbnail: '/thumbs/ableton.jpg', channelName: 'BeatMaker', duration: 2700, watchedAt: '2024-01-12T19:00:00Z', progress: 0.9 },
];

const MOCK_PLAYLISTS: PlaylistData[] = [
  { id: 'pl-mix', title: 'Your Mix', thumbnail: '/thumbs/mix.jpg', videoCount: 50, visibility: 'private', isSystem: true, updatedAt: '2024-01-15' },
  { id: 'pl-liked', title: 'Liked Videos', thumbnail: '/thumbs/liked.jpg', videoCount: 234, visibility: 'private', isSystem: true, updatedAt: '2024-01-15' },
  { id: 'pl-wl', title: 'Watch Later', thumbnail: '/thumbs/wl.jpg', videoCount: 18, visibility: 'private', isSystem: true, updatedAt: '2024-01-14' },
  { id: 'pl-react', title: 'React Learning Path', thumbnail: '/thumbs/react-pl.jpg', videoCount: 24, visibility: 'public', isSystem: false, updatedAt: '2024-01-12' },
  { id: 'pl-music', title: 'Chill Coding Music', thumbnail: '/thumbs/chill.jpg', videoCount: 42, visibility: 'unlisted', isSystem: false, updatedAt: '2024-01-10' },
];

const MOCK_DOWNLOADS: DownloadItem[] = [
  { id: 'd1', videoId: 'v1', title: 'React Hooks Deep Dive', thumbnail: '/thumbs/hooks.jpg', quality: '1080p', fileSize: 524288000, downloadedAt: '2024-01-14', expiresAt: '2024-02-14' },
  { id: 'd2', videoId: 'v3', title: 'CSS Grid Layout Masterclass', thumbnail: '/thumbs/cssgrid.jpg', quality: '720p', fileSize: 314572800, downloadedAt: '2024-01-13', expiresAt: '2024-02-13' },
];

const MOCK_WATCH_LATER: WatchLaterItem[] = [
  { id: 'wl1', videoId: 'v10', title: 'Next.js 15 Features Breakdown', thumbnail: '/thumbs/nextjs15.jpg', channelName: 'TechVision', duration: 1500, addedAt: '2024-01-15' },
  { id: 'wl2', videoId: 'v11', title: 'Advanced TypeScript Patterns', thumbnail: '/thumbs/tsadv.jpg', channelName: 'TypeScriptPro', duration: 2400, addedAt: '2024-01-14' },
  { id: 'wl3', videoId: 'v12', title: 'Rust for JavaScript Developers', thumbnail: '/thumbs/rust.jpg', channelName: 'CodeBridge', duration: 3000, addedAt: '2024-01-13' },
  { id: 'wl4', videoId: 'v13', title: 'Designing Scalable APIs', thumbnail: '/thumbs/apis.jpg', channelName: 'SystemDesign', duration: 2700, addedAt: '2024-01-12' },
];

const LibraryPage: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [watchLater, setWatchLater] = useState<WatchLaterItem[]>([]);
  const [activeSection, setActiveSection] = useState<LibrarySection>('history');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    const loadLibrary = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 400));
        setHistory(MOCK_HISTORY);
        setPlaylists(MOCK_PLAYLISTS);
        setDownloads(MOCK_DOWNLOADS);
        setWatchLater(MOCK_WATCH_LATER);
        setError(null);
      } catch (err) {
        setError('Failed to load library');
      } finally {
        setLoading(false);
      }
    };
    loadLibrary();
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const handleRemoveHistoryItem = useCallback((itemId: string) => {
    setHistory(prev => prev.filter(h => h.id !== itemId));
  }, []);

  const handleRemoveWatchLater = useCallback((itemId: string) => {
    setWatchLater(prev => prev.filter(wl => wl.id !== itemId));
  }, []);

  const handlePlayNext = useCallback((itemId: string) => {
    const item = watchLater.find(wl => wl.id === itemId);
    if (item) {
      setWatchLater(prev => [item, ...prev.filter(wl => wl.id !== itemId)]);
    }
  }, [watchLater]);

  const handleCreatePlaylist = useCallback(() => {
    if (newPlaylistName.trim()) {
      const newPl: PlaylistData = {
        id: `pl-${Date.now()}`,
        title: newPlaylistName.trim(),
        thumbnail: '/thumbs/default-pl.jpg',
        videoCount: 0,
        visibility: 'private',
        isSystem: false,
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setPlaylists(prev => [...prev, newPl]);
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
    }
  }, [newPlaylistName]);

  const handleDeleteDownload = useCallback((downloadId: string) => {
    setDownloads(prev => prev.filter(d => d.id !== downloadId));
  }, []);

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading your library...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Library</h1>
        </div>
      </header>

      {/* Section Tabs */}
      <nav className="border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {([
            { id: 'history' as LibrarySection, label: 'History', count: history.length },
            { id: 'playlists' as LibrarySection, label: 'Playlists', count: playlists.length },
            { id: 'downloads' as LibrarySection, label: 'Downloads', count: downloads.length },
            { id: 'watchLater' as LibrarySection, label: 'Watch Later', count: watchLater.length },
          ]).map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeSection === section.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              {section.label} ({section.count})
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* History Section */}
        {activeSection === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">Watch History</h2>
              {history.length > 0 && (
                <button onClick={handleClearHistory} className="px-4 py-1.5 text-sm text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10">
                  Clear All
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <div className="text-4xl mb-3">Empty</div>
                <p className="text-gray-400">Your watch history is empty.</p>
                <p className="text-gray-500 text-sm mt-1">Videos you watch will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition group">
                    <div className="relative flex-shrink-0">
                      <img src={item.thumbnail} alt={item.title} className="w-40 h-22 rounded-lg object-cover" />
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-white text-xs rounded">{formatDuration(item.duration)}</span>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700 rounded-b-lg overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${item.progress * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.channelName}</p>
                      <p className="text-xs text-gray-500">{formatDate(item.watchedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveHistoryItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 px-3 py-1 text-sm text-gray-400 hover:text-red-400 transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Playlists Section */}
        {activeSection === 'playlists' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">Your Playlists</h2>
              <button onClick={() => setShowCreatePlaylist(true)} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                + New Playlist
              </button>
            </div>

            {showCreatePlaylist && (
              <div className="mb-4 p-4 bg-gray-800 rounded-xl flex items-center gap-3">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                  placeholder="Playlist name"
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button onClick={handleCreatePlaylist} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
                <button onClick={() => setShowCreatePlaylist(false)} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Cancel</button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {playlists.map(pl => (
                <div key={pl.id} className="group cursor-pointer">
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={pl.thumbnail} alt={pl.title} className="w-full aspect-video object-cover group-hover:opacity-80 transition" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3">
                      <span className="text-white text-sm font-medium">{pl.videoCount} videos</span>
                    </div>
                    {pl.isSystem && <span className="absolute top-2 left-2 px-2 py-0.5 bg-gray-900/80 text-gray-300 text-xs rounded">System</span>}
                  </div>
                  <h3 className="mt-2 font-medium text-white truncate">{pl.title}</h3>
                  <p className="text-xs text-gray-400">Updated {pl.updatedAt} - {pl.visibility}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Downloads Section */}
        {activeSection === 'downloads' && (
          <div>
            <h2 className="text-lg font-medium text-white mb-4">Downloads</h2>
            {downloads.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <div className="text-4xl mb-3">Empty</div>
                <p className="text-gray-400">No downloaded videos.</p>
                <p className="text-gray-500 text-sm mt-1">Download videos to watch offline.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {downloads.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-xl group">
                    <div className="relative flex-shrink-0">
                      <img src={item.thumbnail} alt={item.title} className="w-36 h-20 rounded-lg object-cover" />
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-green-600 text-white text-xs rounded font-medium">Offline</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.quality} - {formatFileSize(item.fileSize)}</p>
                      <p className="text-xs text-gray-500">Expires {item.expiresAt}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteDownload(item.id)}
                      className="opacity-0 group-hover:opacity-100 px-3 py-1 text-sm text-red-400 hover:text-red-300 transition"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Watch Later Section */}
        {activeSection === 'watchLater' && (
          <div>
            <h2 className="text-lg font-medium text-white mb-4">Watch Later ({watchLater.length})</h2>
            {watchLater.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <div className="text-4xl mb-3">Empty</div>
                <p className="text-gray-400">Your watch later list is empty.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {watchLater.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition group">
                    <div className="relative flex-shrink-0">
                      <img src={item.thumbnail} alt={item.title} className="w-36 h-20 rounded-lg object-cover" />
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-white text-xs rounded">{formatDuration(item.duration)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.channelName}</p>
                      <p className="text-xs text-gray-500">Added {formatDate(item.addedAt)}</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition">
                      <button onClick={() => handlePlayNext(item.id)} className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600">Play Next</button>
                      <button onClick={() => handleRemoveWatchLater(item.id)} className="px-3 py-1 text-sm text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default LibraryPage;
