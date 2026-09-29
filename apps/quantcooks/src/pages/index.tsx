// ============================================================================
// QuantEdits - Project Gallery Home
// Tabs: Recent/Templates/Shared, create new button, project cards, import media
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { useProjects } from '../hooks/useProjects';
import { useTemplates } from '../hooks/useTemplates';
import { PageTransition } from '../components/PageTransition';
import { containerVariants, cardVariants } from '../lib/motion-variants';

interface Project {
  id: string;
  title: string;
  thumbnail: string;
  lastEdited: string;
  duration: number;
  type: 'video' | 'photo' | 'design';
  status: 'draft' | 'processing' | 'complete';
  collaborators: string[];
  resolution: string;
  fps: number;
}

interface Template {
  id: string;
  title: string;
  thumbnail: string;
  category: string;
  duration: number;
  aspectRatio: string;
  uses: number;
}

interface SharedProject {
  id: string;
  title: string;
  thumbnail: string;
  sharedBy: string;
  sharedAt: string;
  permission: 'view' | 'comment' | 'edit';
  lastEdited: string;
}

type TabType = 'recent' | 'templates' | 'shared';
type ProjectType = 'video' | 'photo' | 'design';

const ProjectCard: React.FC<{
  project: Project;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
}> = ({ project, onOpen, onDuplicate }) => {
  const [showMenu, setShowMenu] = useState(false);

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatTimeAgo = useCallback((dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }, []);

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
      onClick={() => onOpen(project.id)}
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img src={project.thumbnail} alt={project.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-end justify-between p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          {project.type === 'video' && (
            <span className="text-xs font-medium text-white bg-black/60 rounded px-1.5 py-0.5">
              {formatDuration(project.duration)}
            </span>
          )}
          <span
            className={`text-xs font-medium rounded px-1.5 py-0.5 ${
              project.status === 'complete'
                ? 'bg-green-500/80 text-white'
                : project.status === 'processing'
                  ? 'bg-yellow-500/80 text-white'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {project.status}
          </span>
        </div>
        {project.collaborators.length > 0 && (
          <div className="absolute top-2 right-2 flex -space-x-1.5">
            {project.collaborators.slice(0, 3).map((collab, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center ring-2 ring-surface font-medium"
              >
                {collab.charAt(0)}
              </div>
            ))}
            {project.collaborators.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center ring-2 ring-surface">
                +{project.collaborators.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground truncate">{project.title}</h3>
          <button
            className="min-w-touch min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            ...
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-muted capitalize">{project.type}</span>
          <span>{project.resolution}</span>
          <span>{formatTimeAgo(project.lastEdited)}</span>
        </div>
      </div>
      {showMenu && (
        <div className="absolute top-full right-2 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-elevated shadow-lg py-1 animate-scale-in">
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors min-h-touch flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(project.id);
            }}
          >
            Duplicate
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors min-h-touch flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors min-h-touch flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            Share
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors min-h-touch flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            Delete
          </button>
        </div>
      )}
    </motion.div>
  );
};

const TemplateCard: React.FC<{ template: Template; onUse: (id: string) => void }> = ({
  template,
  onUse,
}) => {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img src={template.thumbnail} alt={template.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="px-4 py-2 min-h-touch bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
            onClick={() => onUse(template.id)}
          >
            Use Template
          </button>
        </div>
        <span className="absolute top-2 right-2 text-xs font-medium bg-black/60 text-white rounded px-1.5 py-0.5">
          {template.aspectRatio}
        </span>
      </div>
      <div className="p-3">
        <h4 className="text-sm font-semibold text-foreground truncate">{template.title}</h4>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className="capitalize">{template.category}</span>
          <span>{template.uses} uses</span>
        </div>
      </div>
    </motion.div>
  );
};

const SharedProjectCard: React.FC<{ project: SharedProject; onOpen: (id: string) => void }> = ({
  project,
  onOpen,
}) => {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group rounded-xl border border-border bg-surface overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
      onClick={() => onOpen(project.id)}
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img src={project.thumbnail} alt={project.title} className="w-full h-full object-cover" />
        <span
          className={`absolute top-2 right-2 text-xs font-medium rounded px-1.5 py-0.5 ${
            project.permission === 'edit'
              ? 'bg-green-500/80 text-white'
              : project.permission === 'comment'
                ? 'bg-yellow-500/80 text-white'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {project.permission}
        </span>
      </div>
      <div className="p-3">
        <h4 className="text-sm font-semibold text-foreground truncate">{project.title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Shared by {project.sharedBy}</p>
        <span className="text-xs text-muted-foreground">
          {new Date(project.sharedAt).toLocaleDateString()}
        </span>
      </div>
    </motion.div>
  );
};

const ProjectGallery: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'type'>('date');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useProjects();
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
  } = useTemplates();

  const projects: Project[] = (projectsData ?? []) as unknown as Project[];
  const templates: Template[] = (templatesData ?? []) as unknown as Template[];
  const sharedProjects: SharedProject[] = [];

  const filteredProjects = useMemo(() => {
    let filtered = projects.filter((p: Project) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    if (sortBy === 'date')
      filtered.sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());
    else if (sortBy === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'type') filtered.sort((a, b) => a.type.localeCompare(b.type));
    return filtered;
  }, [projects, searchQuery, sortBy]);

  const handleCreateProject = useCallback((_type: ProjectType) => {
    setShowCreateModal(false);
  }, []);

  const handleOpenProject = useCallback((_id: string) => {
    // Navigation would happen here in production
  }, []);

  const handleDuplicateProject = useCallback((_id: string) => {
    // Duplication would happen here in production
  }, []);

  const handleUseTemplate = useCallback((_id: string) => {
    // Template usage would happen here in production
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    // File import would happen here in production
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingFile(false);
  }, []);

  if (projectsLoading || templatesLoading) {
    return <LoadingState variant="skeleton" text="Loading your projects..." />;
  }

  if (projectsError) {
    return <ErrorState message={projectsError.message} onRetry={() => void refetchProjects()} />;
  }

  return (
    <PageTransition>
      <div
        className="min-h-screen bg-background p-4 sm:p-6 lg:p-8"
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">QuantEdits</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create, edit, and collaborate on stunning content
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 min-h-touch text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              onClick={() => document.getElementById('file-import')?.click()}
            >
              Import Media
            </button>
            <input id="file-import" type="file" multiple accept="video/*,image/*,audio/*" hidden />
            <button
              className="px-4 py-2 min-h-touch text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              onClick={() => setShowCreateModal(true)}
            >
              + Create New
            </button>
          </div>
        </header>

        {isDraggingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">+</div>
              <p className="text-foreground font-medium">Drop files to import</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', ...spring.snappy }}
                className="bg-surface-elevated rounded-2xl p-6 w-full max-w-md shadow-xl border border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-foreground mb-4">Create New Project</h2>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    className="flex flex-col items-center gap-2 p-4 min-h-touch rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => handleCreateProject('video')}
                  >
                    <span className="text-2xl">&#127916;</span>
                    <span className="text-sm font-medium">Video</span>
                    <span className="text-[10px] text-muted-foreground">1920x1080, 30fps</span>
                  </button>
                  <button
                    className="flex flex-col items-center gap-2 p-4 min-h-touch rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => handleCreateProject('photo')}
                  >
                    <span className="text-2xl">&#128248;</span>
                    <span className="text-sm font-medium">Photo</span>
                    <span className="text-[10px] text-muted-foreground">High resolution edit</span>
                  </button>
                  <button
                    className="flex flex-col items-center gap-2 p-4 min-h-touch rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => handleCreateProject('design')}
                  >
                    <span className="text-2xl">&#127912;</span>
                    <span className="text-sm font-medium">Design</span>
                    <span className="text-[10px] text-muted-foreground">Custom canvas</span>
                  </button>
                </div>
                <button
                  className="mt-4 w-full py-2 min-h-touch text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 border-b border-border pb-4">
          <div className="flex gap-1">
            {(
              [
                { id: 'recent', label: `Recent (${projects.length})` },
                { id: 'templates', label: `Templates (${templates.length})` },
                { id: 'shared', label: `Shared (${sharedProjects.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                className={`px-4 py-2 min-h-touch text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="px-3 py-2 min-h-touch text-sm border border-border rounded-lg bg-surface placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-48"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="px-3 py-2 min-h-touch text-sm border border-border rounded-lg bg-surface text-foreground"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="type">Sort by Type</option>
            </select>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'recent' && (
            <motion.div
              key="recent"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {filteredProjects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  description="Create your first project or import media to get started"
                  actionLabel="Create Project"
                  onAction={() => setShowCreateModal(true)}
                />
              ) : (
                <motion.div
                  variants={containerVariants}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onOpen={handleOpenProject}
                      onDuplicate={handleDuplicateProject}
                    />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'templates' && (
            <motion.div
              key="templates"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {templates.length === 0 ? (
                <EmptyState title="No templates" description="Templates will appear here" />
              ) : (
                <motion.div
                  variants={containerVariants}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {templates.map((template) => (
                    <TemplateCard key={template.id} template={template} onUse={handleUseTemplate} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'shared' && (
            <motion.div
              key="shared"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <EmptyState
                title="No shared projects"
                description="Projects shared with you will appear here"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

export default ProjectGallery;
