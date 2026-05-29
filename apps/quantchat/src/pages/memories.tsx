// ============================================================================
// QuantChat - Memories Page
// Saved snaps: date-grouped grid, location map, search, auto-stories, export
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface Memory {
  id: string;
  type: 'photo' | 'video' | 'story';
  thumbnailUrl: string;
  mediaUrl: string;
  caption?: string;
  location?: { lat: number; lng: number; name: string };
  people: string[];
  createdAt: string;
  duration?: number;
  isStarred: boolean;
  tags: string[];
}
interface DateGroup {
  date: string;
  label: string;
  memories: Memory[];
}
interface MemoriesPageProps {
  userId?: string;
}

type ViewMode = 'grid' | 'map' | 'timeline';

export const MemoriesPage: React.FC<MemoriesPageProps> = ({ userId }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());
  const [showAutoStory, setShowAutoStory] = useState<boolean>(false);
  const [autoStoryDate, setAutoStoryDate] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const [page, setPage] = useState<number>(1);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (searchQuery) params.set('q', searchQuery);
      if (filterType !== 'all') params.set('type', filterType);
      if (dateFilter.start) params.set('start', dateFilter.start);
      if (dateFilter.end) params.set('end', dateFilter.end);
      const response = await fetch(`/api/memories?${params}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to fetch memories');
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filterType, dateFilter]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const dateGroups = useMemo((): DateGroup[] => {
    const groups: Record<string, Memory[]> = {};
    memories.forEach((m) => {
      const date = new Date(m.createdAt).toISOString().split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(m);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, mems]) => {
        const d = new Date(date);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
        let label = d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        if (diffDays === 0) label = 'Today';
        else if (diffDays === 1) label = 'Yesterday';
        else if (diffDays < 7) label = `${diffDays} days ago`;
        return { date, label, memories: mems };
      });
  }, [memories]);

  const handleDelete = useCallback(async (ids: string[]) => {
    try {
      await fetch('/api/memories/batch/delete', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ ids }),
      });
      setMemories((prev) => prev.filter((m) => !ids.includes(m.id)));
      setSelectedMemories(new Set());
    } catch (err) {
      logger.error('Delete failed:', err);
    }
  }, []);

  const handleExport = useCallback(async (ids: string[]) => {
    try {
      const response = await fetch('/api/memories/export', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ ids }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'memories-export.zip';
        a.click();
      }
    } catch (err) {
      logger.error('Export failed:', err);
    }
  }, []);

  const handleStar = useCallback(async (id: string) => {
    setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, isStarred: !m.isStarred } : m)));
    try {
      await fetch(`/api/memories/${id}/star`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      /* optimistic */
    }
  }, []);

  const handleGenerateAutoStory = useCallback(async () => {
    if (!autoStoryDate) return;
    try {
      const response = await fetch('/api/memories/auto-story', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ date: autoStoryDate }),
      });
      if (response.ok) {
        setShowAutoStory(false);
      }
    } catch (err) {
      logger.error('Auto-story failed:', err);
    }
  }, [autoStoryDate]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedMemories((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  if (error && memories.length === 0)
    return (
      <div className="memories-error">
        <h2>Memories Error</h2>
        <p>{error}</p>
        <button onClick={fetchMemories}>Retry</button>
      </div>
    );

  return (
    <div className="memories-page">
      <header className="memories-header">
        <h1>Memories</h1>
        <div className="memories-controls">
          <input
            type="text"
            placeholder="Search by date, location, people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All</option>
            <option value="photo">Photos</option>
            <option value="video">Videos</option>
            <option value="story">Stories</option>
          </select>
          <div className="view-toggle">
            <button
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'active' : ''}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={viewMode === 'map' ? 'active' : ''}
            >
              Map
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={viewMode === 'timeline' ? 'active' : ''}
            >
              Timeline
            </button>
          </div>
          <button onClick={() => setShowAutoStory(true)} className="auto-story-btn">
            Auto Story
          </button>
        </div>
      </header>
      {selectedMemories.size > 0 && (
        <div className="batch-actions">
          <span>{selectedMemories.size} selected</span>
          <button onClick={() => handleExport(Array.from(selectedMemories))}>Export</button>
          <button onClick={() => handleDelete(Array.from(selectedMemories))} className="delete-btn">
            Delete
          </button>
          <button onClick={() => setSelectedMemories(new Set())}>Clear</button>
        </div>
      )}
      <main className="memories-content">
        {loading ? (
          <div className="loading-state">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="memory-skeleton"></div>
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="empty-state">
            <h3>No memories yet</h3>
            <p>Your saved snaps and stories will appear here.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="memories-grid-view">
            {dateGroups.map((group) => (
              <div key={group.date} className="date-group">
                <h3 className="group-date">{group.label}</h3>
                <div className="memory-grid">
                  {group.memories.map((memory) => (
                    <div
                      key={memory.id}
                      className={`memory-card ${selectedMemories.has(memory.id) ? 'selected' : ''}`}
                      onClick={() => setSelectedMemory(memory)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        toggleSelect(memory.id);
                      }}
                    >
                      <img src={memory.thumbnailUrl} alt="" className="memory-thumb" />
                      {memory.type === 'video' && (
                        <span className="video-badge">{memory.duration}s</span>
                      )}
                      {memory.isStarred && <span className="star-badge">\u2B50</span>}
                      {memory.location && (
                        <span className="location-badge">{memory.location.name}</span>
                      )}
                      <div className="memory-overlay">
                        <input
                          type="checkbox"
                          checked={selectedMemories.has(memory.id)}
                          onChange={() => toggleSelect(memory.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'map' ? (
          <div className="memories-map-view">
            <div className="map-container">
              <p className="map-placeholder">
                Map view showing {memories.filter((m) => m.location).length} memories with locations
              </p>
              <div className="map-pins">
                {memories
                  .filter((m) => m.location)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="map-pin"
                      style={{
                        left: `${((m.location!.lng + 180) / 360) * 100}%`,
                        top: `${((90 - m.location!.lat) / 180) * 100}%`,
                      }}
                      onClick={() => setSelectedMemory(m)}
                    >
                      <img src={m.thumbnailUrl} alt="" className="pin-thumb" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="memories-timeline-view">
            {dateGroups.map((group) => (
              <div key={group.date} className="timeline-group">
                <div className="timeline-date">
                  <span>{group.label}</span>
                  <span className="count">{group.memories.length} items</span>
                </div>
                <div className="timeline-items">
                  {group.memories.map((m) => (
                    <div key={m.id} className="timeline-item" onClick={() => setSelectedMemory(m)}>
                      <img src={m.thumbnailUrl} alt="" />
                      <div className="item-info">
                        <span>{m.caption || m.type}</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {selectedMemory && (
        <div className="memory-viewer" onClick={() => setSelectedMemory(null)}>
          <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
            {selectedMemory.type === 'video' ? (
              <video src={selectedMemory.mediaUrl} controls autoPlay />
            ) : (
              <img src={selectedMemory.mediaUrl} alt="" />
            )}
            <div className="viewer-info">
              <p>{selectedMemory.caption}</p>
              {selectedMemory.location && <p>{selectedMemory.location.name}</p>}
              <p>{new Date(selectedMemory.createdAt).toLocaleString()}</p>
              {selectedMemory.people.length > 0 && <p>With: {selectedMemory.people.join(', ')}</p>}
            </div>
            <div className="viewer-actions">
              <button onClick={() => handleStar(selectedMemory.id)}>
                {selectedMemory.isStarred ? 'Unstar' : 'Star'}
              </button>
              <button onClick={() => handleExport([selectedMemory.id])}>Export</button>
              <button
                onClick={() => {
                  handleDelete([selectedMemory.id]);
                  setSelectedMemory(null);
                }}
                className="delete-btn"
              >
                Delete
              </button>
              <button onClick={() => setSelectedMemory(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showAutoStory && (
        <div className="modal-overlay" onClick={() => setShowAutoStory(false)}>
          <div className="auto-story-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Generate Auto-Story</h2>
            <p>Create a story from memories on a specific date.</p>
            <input
              type="date"
              value={autoStoryDate}
              onChange={(e) => setAutoStoryDate(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setShowAutoStory(false)}>Cancel</button>
              <button onClick={handleGenerateAutoStory} disabled={!autoStoryDate}>
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoriesPage;
