// ============================================================================
// QuantTube - Live Streaming Hub
// Live streams directory with categories
//
// HONESTY NOTE: This page previously rendered hardcoded MOCK_STREAMS /
// MOCK_SCHEDULE behind a fake loader and a 10s interval that random-walked
// viewer counts. It now reads GET /api/live only. No streams and failed
// requests render honest empty/error states — never invented streams or
// fabricated viewer numbers.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api-client';
import type { LiveStream } from '../types';

type StreamCategory = 'all' | 'gaming' | 'music' | 'talk' | 'sports' | 'creative';

const CATEGORIES: { id: StreamCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'music', label: 'Music' },
  { id: 'talk', label: 'Talk Shows' },
  { id: 'sports', label: 'Sports' },
  { id: 'creative', label: 'Creative' },
];

const LivePage: React.FC = () => {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [activeCategory, setActiveCategory] = useState<StreamCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStreams = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getLiveStreams();
        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Failed to load live streams');
        }
        setStreams(response.data.streams ?? []);
        setError(null);
      } catch (err) {
        setStreams([]);
        setError(err instanceof Error ? err.message : 'Failed to load live streams');
      } finally {
        setLoading(false);
      }
    };
    loadStreams();
  }, []);

  const handleCategoryChange = useCallback((category: StreamCategory) => {
    setActiveCategory(category);
  }, []);

  const filteredStreams = activeCategory === 'all'
    ? streams
    : streams.filter(s => s.category?.toLowerCase() === activeCategory);

  const formatViewers = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading live streams...</p>
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
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Live</h1>
            <span className="flex items-center gap-1 px-2 py-1 bg-red-600 rounded text-xs font-bold">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {streams.length} LIVE
            </span>
          </div>
        </div>
      </header>

      {/* Categories Filter */}
      <nav className="px-6 py-3 border-b border-gray-800">
        <div className="flex gap-2 max-w-7xl mx-auto overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${activeCategory === cat.id ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={cat.label}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Live Now Grid */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">
            {activeCategory === 'all' ? 'All Live Streams' : `${CATEGORIES.find(c => c.id === activeCategory)?.label} Streams`}
          </h2>
          {filteredStreams.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">No streams</div>
              <p className="text-gray-400">No live streams right now.</p>
              <p className="text-gray-500 mt-2">Check back later or browse other categories.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStreams.map(stream => (
                <div key={stream.id} className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-red-500 transition cursor-pointer group">
                  <div className="relative">
                    <img src={stream.thumbnailUrl} alt={stream.title} className="w-full aspect-video object-cover group-hover:opacity-90 transition" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">LIVE</span>
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">{formatViewers(stream.viewerCount)} viewers</span>
                  </div>
                  <div className="p-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                      {stream.channelName?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{stream.title}</h3>
                      <p className="text-xs text-gray-400">{stream.channelName}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(stream.tags ?? []).map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default LivePage;
