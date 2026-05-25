// ============================================================================
// QuantEdits - Project Manager
// Search, sort, bulk actions, project cards with status, storage usage
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface Project {
  id: string;
  title: string;
  thumbnail: string;
  type: 'video' | 'photo' | 'design';
  status: 'draft' | 'processing' | 'complete';
  createdAt: string;
  lastEdited: string;
  size: number;
  duration: number;
  resolution: string;
  collaborators: string[];
  isArchived: boolean;
  isFavorite: boolean;
}

interface StorageInfo {
  used: number;
  total: number;
  breakdown: { videos: number; images: number; audio: number; other: number };
}

interface ProjectManagerProps {
  userId: string;
}

type SortField = 'date' | 'name' | 'size' | 'type';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'draft' | 'processing' | 'complete';

const ProjectManager: React.FC<ProjectManagerProps> = ({ userId }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [storage, setStorage] = useState<StorageInfo>({ used: 0, total: 0, breakdown: { videos: 0, images: 0, audio: 0, other: 0 } });
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        const mockProjects: Project[] = Array.from({ length: 24 }, (_, i) => ({
          id: `proj-${i}`,
          title: `${['Marketing Video', 'Product Demo', 'Social Post', 'Story', 'Tutorial', 'Promo'][i % 6]} ${i + 1}`,
          thumbnail: `/thumbnails/project-${i}.jpg`,
          type: (['video', 'photo', 'design'] as const)[i % 3],
          status: (['draft', 'processing', 'complete'] as const)[i % 3],
          createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
          lastEdited: new Date(Date.now() - i * 3600000 * 12).toISOString(),
          size: Math.floor(Math.random() * 500 + 10) * 1024 * 1024,
          duration: Math.floor(Math.random() * 300) + 15,
          resolution: ['1920x1080', '1080x1920', '1080x1080', '3840x2160'][i % 4],
          collaborators: i % 4 === 0 ? ['Alice', 'Bob', 'Charlie'] : i % 3 === 0 ? ['Dave'] : [],
          isArchived: i > 20,
          isFavorite: i < 3,
        }));
        setProjects(mockProjects);
        setStorage({
          used: 45.2 * 1024 * 1024 * 1024,
          total: 100 * 1024 * 1024 * 1024,
          breakdown: { videos: 32 * 1024 * 1024 * 1024, images: 8 * 1024 * 1024 * 1024, audio: 3 * 1024 * 1024 * 1024, other: 2.2 * 1024 * 1024 * 1024 },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, [userId]);

  const filteredProjects = useMemo(() => {
    let result = projects
      .filter(p => showArchived ? p.isArchived : !p.isArchived)
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = new Date(a.lastEdited).getTime() - new Date(b.lastEdited).getTime();
      else if (sortField === 'name') cmp = a.title.localeCompare(b.title);
      else if (sortField === 'size') cmp = a.size - b.size;
      else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [projects, searchQuery, sortField, sortDirection, filterStatus, showArchived]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  }, [filteredProjects, selectedIds]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkExport = useCallback(() => {
    console.log('Exporting projects:', Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkDuplicate = useCallback(() => {
    const dupes = projects.filter(p => selectedIds.has(p.id)).map(p => ({
      ...p, id: `dup-${p.id}-${Date.now()}`, title: `${p.title} (Copy)`, createdAt: new Date().toISOString(),
    }));
    setProjects(prev => [...dupes, ...prev]);
    setSelectedIds(new Set());
  }, [projects, selectedIds]);

  const handleBulkArchive = useCallback(() => {
    setProjects(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, isArchived: true } : p));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkDelete = useCallback(() => {
    setProjects(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setConfirmDelete(null);
  }, [selectedIds]);

  const handleToggleFavorite = useCallback((id: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p));
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  const storagePercent = useMemo(() => Math.round((storage.used / storage.total) * 100), [storage]);

  if (loading) {
    return (
      <div className="projects-loading">
        <div className="loading-spinner" />
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="projects-error">
        <h3>Failed to load projects</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="project-manager">
      <header className="manager-header">
        <h1>Project Manager</h1>
        <div className="storage-bar">
          <div className="storage-info">
            <span>{formatSize(storage.used)} / {formatSize(storage.total)} used</span>
            <span className="storage-percent">{storagePercent}%</span>
          </div>
          <div className="storage-progress">
            <div className="storage-fill" style={{ width: `${storagePercent}%` }} />
          </div>
          <div className="storage-breakdown">
            <span className="breakdown-item videos">Videos: {formatSize(storage.breakdown.videos)}</span>
            <span className="breakdown-item images">Images: {formatSize(storage.breakdown.images)}</span>
            <span className="breakdown-item audio">Audio: {formatSize(storage.breakdown.audio)}</span>
          </div>
        </div>
      </header>

      <div className="manager-toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            className="search-input"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} className="filter-select">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="processing">Processing</option>
            <option value="complete">Complete</option>
          </select>
          <div className="sort-controls">
            <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)} className="sort-select">
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
            <button className="sort-dir-btn" onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}>
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <label className="archive-toggle">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
          <div className="view-toggle">
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>Grid</button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-actions-bar">
          <span className="selected-count">{selectedIds.size} selected</span>
          <button className="bulk-btn" onClick={handleSelectAll}>
            {selectedIds.size === filteredProjects.length ? 'Deselect All' : 'Select All'}
          </button>
          <button className="bulk-btn" onClick={handleBulkExport}>Export</button>
          <button className="bulk-btn" onClick={handleBulkDuplicate}>Duplicate</button>
          <button className="bulk-btn" onClick={handleBulkArchive}>Archive</button>
          <button className="bulk-btn delete" onClick={() => setConfirmDelete('bulk')}>Delete</button>
        </div>
      )}

      {confirmDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete {selectedIds.size} project(s)? This cannot be undone.</p>
            <div className="confirm-actions">
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="delete-confirm-btn" onClick={handleBulkDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className={`projects-${viewMode}`}>
        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>{showArchived ? 'No archived projects' : 'No projects found'}</h3>
            <p>{searchQuery ? 'Try a different search term' : 'Create your first project to get started'}</p>
          </div>
        ) : (
          filteredProjects.map(project => (
            <div key={project.id} className={`project-item ${selectedIds.has(project.id) ? 'selected' : ''}`}>
              <div className="select-checkbox">
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => handleToggleSelect(project.id)}
                />
              </div>
              <div className="project-thumb">
                <img src={project.thumbnail} alt={project.title} />
                <span className={`status-indicator status-${project.status}`} />
              </div>
              <div className="project-details">
                <div className="project-name-row">
                  <h3>{project.title}</h3>
                  <button className="fav-btn" onClick={() => handleToggleFavorite(project.id)}>
                    {project.isFavorite ? '★' : '☆'}
                  </button>
                </div>
                <div className="project-meta">
                  <span className={`type-badge type-${project.type}`}>{project.type}</span>
                  <span className="project-size">{formatSize(project.size)}</span>
                  <span className="project-resolution">{project.resolution}</span>
                  <span className="project-date">{new Date(project.lastEdited).toLocaleDateString()}</span>
                </div>
                {project.collaborators.length > 0 && (
                  <div className="collab-list">
                    {project.collaborators.map((c, i) => (
                      <span key={i} className="collab-chip">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="manager-footer">
        <span>{filteredProjects.length} project(s)</span>
        <span>Total size: {formatSize(filteredProjects.reduce((sum, p) => sum + p.size, 0))}</span>
      </div>
    </div>
  );
};

export default ProjectManager;
