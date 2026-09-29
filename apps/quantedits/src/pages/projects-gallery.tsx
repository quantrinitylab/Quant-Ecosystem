// ============================================================================
// QuantEdits - Projects Gallery Page
// Grid of project cards with thumbnails, titles, duration, last edited, actions
// ============================================================================

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { PageTransition } from '../components/PageTransition';
import { useProjects } from '../hooks/useProjects';

interface Project {
  id: string;
  title: string;
  thumbnailUrl: string;
  duration: number;
  lastEdited: string;
  createdAt: string;
  resolution: string;
  trackCount: number;
}

const ProjectsGalleryPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useProjects();
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'duration'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const projects: Project[] = ((data ?? []) as unknown[]).map((item: unknown, index: number) => {
    const p = item as Record<string, unknown>;
    return {
      id: (p.id as string) || `project-${index}`,
      title: (p.title as string) || `Untitled Project ${index + 1}`,
      thumbnailUrl: (p.thumbnailUrl as string) || `/projects/thumb-${index}.jpg`,
      duration: (p.duration as number) || Math.floor(Math.random() * 300) + 30,
      lastEdited:
        (p.lastEdited as string) ||
        new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      createdAt:
        (p.createdAt as string) ||
        new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      resolution: (p.resolution as string) || '1920x1080',
      trackCount: (p.trackCount as number) || Math.floor(Math.random() * 5) + 2,
    };
  });

  const filtered = projects.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'recent')
      return new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime();
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    return b.duration - a.duration;
  });

  const formatDuration = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const formatRelativeTime = useCallback((iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }, []);

  const handleDelete = useCallback((projectId: string) => {
    setShowDeleteConfirm(null);
    // In production, call API to delete
  }, []);

  const handleDuplicate = useCallback((_projectId: string) => {
    // In production, call API to duplicate
  }, []);

  if (isLoading) return <LoadingState variant="skeleton" text="Loading projects..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <PageTransition>
      <div className="projects-gallery" role="main" aria-label="Projects gallery">
        <header className="gallery-header">
          <h1 className="gallery-title">My Projects</h1>
          <div className="gallery-actions">
            <input
              className="gallery-search"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search projects"
            />
            <select
              className="gallery-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort projects"
            >
              <option value="recent">Most Recent</option>
              <option value="name">Name</option>
              <option value="duration">Duration</option>
            </select>
            <button className="new-project-btn" aria-label="Create new project">
              + New Project
            </button>
          </div>
        </header>

        {sorted.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create your first project to get started"
          />
        ) : (
          <div className="projects-grid">
            {sorted.map((project) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', ...spring.gentle }}
                className="project-card"
                onMouseEnter={() => setHoveredProject(project.id)}
                onMouseLeave={() => setHoveredProject(null)}
                role="article"
                aria-label={`Project: ${project.title}`}
              >
                <div className="project-thumbnail">
                  <img src={project.thumbnailUrl} alt={project.title} loading="lazy" />
                  <span className="project-duration-badge">{formatDuration(project.duration)}</span>

                  <AnimatePresence>
                    {hoveredProject === project.id && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="project-hover-actions"
                      >
                        <button
                          className="project-action-btn play-btn"
                          aria-label={`Play ${project.title}`}
                        >
                          &#9654;
                        </button>
                        <button
                          className="project-action-btn edit-btn"
                          aria-label={`Edit ${project.title}`}
                        >
                          &#9998;
                        </button>
                        <button
                          className="project-action-btn duplicate-btn"
                          onClick={() => handleDuplicate(project.id)}
                          aria-label={`Duplicate ${project.title}`}
                        >
                          &#128203;
                        </button>
                        <button
                          className="project-action-btn share-btn"
                          aria-label={`Share ${project.title}`}
                        >
                          &#10148;
                        </button>
                        <button
                          className="project-action-btn delete-btn"
                          onClick={() => setShowDeleteConfirm(project.id)}
                          aria-label={`Delete ${project.title}`}
                        >
                          &#128465;
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="project-info">
                  <h3 className="project-title">{project.title}</h3>
                  <div className="project-meta">
                    <span className="project-edited">{formatRelativeTime(project.lastEdited)}</span>
                    <span className="project-resolution">{project.resolution}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="delete-modal-overlay"
              onClick={() => setShowDeleteConfirm(null)}
              role="dialog"
              aria-label="Confirm delete"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', ...spring.snappy }}
                className="delete-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Delete Project?</h3>
                <p>This action cannot be undone.</p>
                <div className="delete-modal-actions">
                  <button className="cancel-delete-btn" onClick={() => setShowDeleteConfirm(null)}>
                    Cancel
                  </button>
                  <button
                    className="confirm-delete-btn"
                    onClick={() => handleDelete(showDeleteConfirm)}
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

export default ProjectsGalleryPage;
