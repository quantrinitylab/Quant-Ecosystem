// ============================================================================
// QuantEdits - Project Manager
// Search, sort, bulk actions, project cards with status, storage usage
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useProjects } from '../hooks/useProjects';
import { PageTransition } from '../components/PageTransition';

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

type SortField = 'date' | 'name' | 'size' | 'type';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'draft' | 'processing' | 'complete';

const ProjectManager: React.FC = () => {
  const { data: projectsData, isLoading, error, refetch } = useProjects();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const projects: Project[] = (projectsData ?? []) as unknown as Project[];

  const filteredProjects = useMemo(() => {
    let result = projects
      .filter((p) => (showArchived ? p.isArchived : !p.isArchived))
      .filter((p) => filterStatus === 'all' || p.status === filterStatus)
      .filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date')
        cmp =
          new Date(a.lastEdited || a.createdAt).getTime() -
          new Date(b.lastEdited || b.createdAt).getTime();
      else if (sortField === 'name') cmp = a.title.localeCompare(b.title);
      else if (sortField === 'size') cmp = (a.size || 0) - (b.size || 0);
      else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [projects, searchQuery, sortField, sortDirection, filterStatus, showArchived]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProjects.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
  }, [filteredProjects, selectedIds]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    setSelectedIds(new Set());
    setConfirmDelete(null);
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  if (isLoading) return <LoadingState variant="skeleton" text="Loading projects..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <PageTransition>
      <div className="project-manager">
        <header className="manager-header">
          <h1>Project Manager</h1>
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
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="processing">Processing</option>
              <option value="complete">Complete</option>
            </select>
            <div className="sort-controls">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="sort-select"
              >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="type">Type</option>
              </select>
              <button
                className="sort-dir-btn"
                onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
          <div className="toolbar-right">
            <label className="archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show Archived
            </label>
            <div className="view-toggle">
              <button
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bulk-actions-bar">
            <span className="selected-count">{selectedIds.size} selected</span>
            <button className="bulk-btn" onClick={handleSelectAll}>
              {selectedIds.size === filteredProjects.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              className="bulk-btn"
              onClick={() => {
                setSelectedIds(new Set());
              }}
            >
              Export
            </button>
            <button className="bulk-btn delete" onClick={() => setConfirmDelete('bulk')}>
              Delete
            </button>
          </div>
        )}

        {confirmDelete && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal">
              <h3>Confirm Delete</h3>
              <p>
                Are you sure you want to delete {selectedIds.size} project(s)? This cannot be
                undone.
              </p>
              <div className="confirm-actions">
                <button onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="delete-confirm-btn" onClick={handleBulkDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`projects-${viewMode}`}>
          {filteredProjects.length === 0 ? (
            <EmptyState
              title={showArchived ? 'No archived projects' : 'No projects found'}
              description={
                searchQuery
                  ? 'Try a different search term'
                  : 'Create your first project to get started'
              }
            />
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className={`project-item ${selectedIds.has(project.id) ? 'selected' : ''}`}
              >
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
                  </div>
                  <div className="project-meta">
                    <span className={`type-badge type-${project.type}`}>{project.type}</span>
                    <span className="project-size">{formatSize(project.size || 0)}</span>
                    <span className="project-resolution">{project.resolution}</span>
                    <span className="project-date">
                      {new Date(project.lastEdited || project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {project.collaborators && project.collaborators.length > 0 && (
                    <div className="collab-list">
                      {project.collaborators.map((c, i) => (
                        <span key={i} className="collab-chip">
                          {c}
                        </span>
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
          <span>
            Total size: {formatSize(filteredProjects.reduce((sum, p) => sum + (p.size || 0), 0))}
          </span>
        </div>
      </div>
    </PageTransition>
  );
};

export default ProjectManager;
