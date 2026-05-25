// ============================================================================
// QuantEdits - Project Gallery Home
// Tabs: Recent/Templates/Shared, create new button, project cards, import media
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

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

interface ProjectGalleryProps {
  userId: string;
}

type TabType = 'recent' | 'templates' | 'shared';
type ProjectType = 'video' | 'photo' | 'design';

const ProjectCard: React.FC<{ project: Project; onOpen: (id: string) => void; onDuplicate: (id: string) => void }> = ({
  project,
  onOpen,
  onDuplicate,
}) => {
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
    <div className="project-card" onClick={() => onOpen(project.id)}>
      <div className="project-card-thumbnail">
        <img src={project.thumbnail} alt={project.title} className="thumbnail-image" />
        <div className="project-card-overlay">
          {project.type === 'video' && (
            <span className="duration-badge">{formatDuration(project.duration)}</span>
          )}
          <span className={`status-badge status-${project.status}`}>{project.status}</span>
        </div>
        {project.collaborators.length > 0 && (
          <div className="collaborator-avatars">
            {project.collaborators.slice(0, 3).map((collab, i) => (
              <div key={i} className="collab-avatar">{collab.charAt(0)}</div>
            ))}
            {project.collaborators.length > 3 && (
              <div className="collab-avatar collab-more">+{project.collaborators.length - 3}</div>
            )}
          </div>
        )}
      </div>
      <div className="project-card-info">
        <div className="project-card-header">
          <h3 className="project-title">{project.title}</h3>
          <button
            className="menu-button"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          >
            ...
          </button>
        </div>
        <div className="project-meta">
          <span className="project-type-badge">{project.type}</span>
          <span className="project-resolution">{project.resolution}</span>
          <span className="project-edited">{formatTimeAgo(project.lastEdited)}</span>
        </div>
      </div>
      {showMenu && (
        <div className="project-menu">
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(project.id); }}>Duplicate</button>
          <button onClick={(e) => { e.stopPropagation(); }}>Rename</button>
          <button onClick={(e) => { e.stopPropagation(); }}>Share</button>
          <button onClick={(e) => { e.stopPropagation(); }} className="delete-btn">Delete</button>
        </div>
      )}
    </div>
  );
};

const TemplateCard: React.FC<{ template: Template; onUse: (id: string) => void }> = ({ template, onUse }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="template-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="template-thumbnail">
        <img src={template.thumbnail} alt={template.title} className="thumbnail-image" />
        {isHovered && (
          <div className="template-preview-overlay">
            <button className="use-template-btn" onClick={() => onUse(template.id)}>
              Use Template
            </button>
          </div>
        )}
        <span className="template-ratio-badge">{template.aspectRatio}</span>
      </div>
      <div className="template-info">
        <h4 className="template-title">{template.title}</h4>
        <div className="template-meta">
          <span className="template-category">{template.category}</span>
          <span className="template-uses">{template.uses} uses</span>
        </div>
      </div>
    </div>
  );
};

const SharedProjectCard: React.FC<{ project: SharedProject; onOpen: (id: string) => void }> = ({ project, onOpen }) => {
  return (
    <div className="shared-project-card" onClick={() => onOpen(project.id)}>
      <div className="shared-thumbnail">
        <img src={project.thumbnail} alt={project.title} className="thumbnail-image" />
        <span className={`permission-badge permission-${project.permission}`}>{project.permission}</span>
      </div>
      <div className="shared-info">
        <h4 className="shared-title">{project.title}</h4>
        <p className="shared-by">Shared by {project.sharedBy}</p>
        <span className="shared-date">{new Date(project.sharedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

const ProjectGallery: React.FC<ProjectGalleryProps> = ({ userId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<ProjectType>('video');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'type'>('date');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const mockProjects: Project[] = Array.from({ length: 12 }, (_, i) => ({
          id: `proj-${i}`,
          title: `Project ${i + 1}`,
          thumbnail: `/thumbnails/project-${i}.jpg`,
          lastEdited: new Date(Date.now() - i * 3600000 * 24).toISOString(),
          duration: Math.floor(Math.random() * 300) + 30,
          type: (['video', 'photo', 'design'] as const)[i % 3],
          status: (['draft', 'processing', 'complete'] as const)[i % 3],
          collaborators: i % 3 === 0 ? ['Alice', 'Bob'] : [],
          resolution: i % 2 === 0 ? '1920x1080' : '1080x1920',
          fps: 30,
        }));
        setProjects(mockProjects);
        setTemplates(Array.from({ length: 8 }, (_, i) => ({
          id: `tmpl-${i}`,
          title: `Template ${i + 1}`,
          thumbnail: `/thumbnails/template-${i}.jpg`,
          category: ['Social Media', 'Marketing', 'Education', 'Entertainment'][i % 4],
          duration: 30 + i * 15,
          aspectRatio: ['16:9', '9:16', '1:1', '4:5'][i % 4],
          uses: Math.floor(Math.random() * 10000),
        })));
        setSharedProjects(Array.from({ length: 5 }, (_, i) => ({
          id: `shared-${i}`,
          title: `Shared Project ${i + 1}`,
          thumbnail: `/thumbnails/shared-${i}.jpg`,
          sharedBy: ['Alice', 'Bob', 'Charlie'][i % 3],
          sharedAt: new Date(Date.now() - i * 86400000).toISOString(),
          permission: (['view', 'comment', 'edit'] as const)[i % 3],
          lastEdited: new Date(Date.now() - i * 7200000).toISOString(),
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [userId]);

  const filteredProjects = useMemo(() => {
    let filtered = projects.filter(p =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (sortBy === 'date') filtered.sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());
    else if (sortBy === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'type') filtered.sort((a, b) => a.type.localeCompare(b.type));
    return filtered;
  }, [projects, searchQuery, sortBy]);

  const handleCreateProject = useCallback((type: ProjectType) => {
    setSelectedType(type);
    setShowCreateModal(false);
    console.log(`Creating new ${type} project`);
  }, []);

  const handleOpenProject = useCallback((id: string) => {
    console.log(`Opening project ${id}`);
  }, []);

  const handleDuplicateProject = useCallback((id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
      const duplicate = { ...project, id: `proj-dup-${Date.now()}`, title: `${project.title} (Copy)` };
      setProjects(prev => [duplicate, ...prev]);
    }
  }, [projects]);

  const handleUseTemplate = useCallback((id: string) => {
    console.log(`Using template ${id}`);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files);
    console.log('Importing files:', files.map(f => f.name));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingFile(false);
  }, []);

  if (loading) {
    return (
      <div className="gallery-loading">
        <div className="loading-spinner" />
        <p>Loading your projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery-error">
        <div className="error-icon">!</div>
        <h3>Something went wrong</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  return (
    <div
      className="project-gallery"
      onDrop={handleFileDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <header className="gallery-header">
        <div className="header-left">
          <h1 className="gallery-title">QuantEdits</h1>
          <p className="gallery-subtitle">Create, edit, and collaborate on stunning content</p>
        </div>
        <div className="header-actions">
          <button className="import-btn" onClick={() => document.getElementById('file-import')?.click()}>
            Import Media
          </button>
          <input id="file-import" type="file" multiple accept="video/*,image/*,audio/*" hidden />
          <button className="create-btn" onClick={() => setShowCreateModal(true)}>
            + Create New
          </button>
        </div>
      </header>

      {isDraggingFile && (
        <div className="drop-overlay">
          <div className="drop-content">
            <div className="drop-icon">+</div>
            <p>Drop files to import</p>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="create-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Project</h2>
            <div className="project-type-grid">
              <button className="type-option" onClick={() => handleCreateProject('video')}>
                <div className="type-icon">🎬</div>
                <span className="type-name">Video</span>
                <span className="type-desc">1920x1080, 30fps</span>
              </button>
              <button className="type-option" onClick={() => handleCreateProject('photo')}>
                <div className="type-icon">📸</div>
                <span className="type-name">Photo</span>
                <span className="type-desc">High resolution edit</span>
              </button>
              <button className="type-option" onClick={() => handleCreateProject('design')}>
                <div className="type-icon">🎨</div>
                <span className="type-name">Design</span>
                <span className="type-desc">Custom canvas</span>
              </button>
            </div>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="gallery-toolbar">
        <div className="tab-bar">
          <button className={`tab ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')}>
            Recent ({projects.length})
          </button>
          <button className={`tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            Templates ({templates.length})
          </button>
          <button className={`tab ${activeTab === 'shared' ? 'active' : ''}`} onClick={() => setActiveTab('shared')}>
            Shared ({sharedProjects.length})
          </button>
        </div>
        <div className="toolbar-right">
          <input
            type="text"
            className="search-input"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="type">Sort by Type</option>
          </select>
        </div>
      </div>

      <div className="gallery-content">
        {activeTab === 'recent' && (
          <div className="projects-grid">
            {filteredProjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎬</div>
                <h3>No projects yet</h3>
                <p>Create your first project or import media to get started</p>
                <button className="create-btn" onClick={() => setShowCreateModal(true)}>Create Project</button>
              </div>
            ) : (
              filteredProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpenProject}
                  onDuplicate={handleDuplicateProject}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="templates-grid">
            {templates.map(template => (
              <TemplateCard key={template.id} template={template} onUse={handleUseTemplate} />
            ))}
          </div>
        )}

        {activeTab === 'shared' && (
          <div className="shared-grid">
            {sharedProjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🤝</div>
                <h3>No shared projects</h3>
                <p>Projects shared with you will appear here</p>
              </div>
            ) : (
              sharedProjects.map(project => (
                <SharedProjectCard key={project.id} project={project} onOpen={handleOpenProject} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectGallery;
