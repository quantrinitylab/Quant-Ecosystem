// ============================================================================
// QuantEdits - Projects Page
// Project management and organization
// ============================================================================

import type { Project, ProjectType } from '../types';

interface ProjectsPageProps {
  projects: Project[];
  filter: ProjectType | 'all';
  sortBy: 'updated' | 'created' | 'name';
  onFilter: (type: ProjectType | 'all') => void;
  onSort: (sort: 'updated' | 'created' | 'name') => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function ProjectsPage({ projects, filter, sortBy, onFilter, onSort, onOpen, onDelete, onDuplicate }: ProjectsPageProps) {
  const sorted = [...projects].sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    if (sortBy === 'created') return b.createdAt.localeCompare(a.createdAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const filtered = filter === 'all' ? sorted : sorted.filter(p => p.type === filter);

  return {
    type: 'div',
    className: 'projects-page',
    children: [
      { type: 'header', children: [
        { type: 'h1', text: 'My Projects' },
        { type: 'div', className: 'filters', children: [
          { type: 'select', value: filter, onChange: onFilter, children: [
            { type: 'option', value: 'all', text: 'All Types' },
            { type: 'option', value: 'video', text: 'Videos' },
            { type: 'option', value: 'photo', text: 'Photos' },
            { type: 'option', value: 'design', text: 'Designs' },
            { type: 'option', value: 'presentation', text: 'Presentations' },
          ]},
          { type: 'select', value: sortBy, onChange: onSort, children: [
            { type: 'option', value: 'updated', text: 'Last Modified' },
            { type: 'option', value: 'created', text: 'Date Created' },
            { type: 'option', value: 'name', text: 'Name' },
          ]},
        ]},
      ]},
      { type: 'div', className: 'projects-grid', children: filtered.map(project => ({
        type: 'div',
        className: 'project-card',
        children: [
          { type: 'div', className: 'thumbnail', onClick: () => onOpen(project.id), style: { backgroundImage: `url(${project.thumbnail || '/placeholder.png'})` } },
          { type: 'h3', text: project.title },
          { type: 'div', className: 'meta', children: [
            { type: 'span', text: project.type },
            { type: 'span', text: `${project.width}x${project.height}` },
            { type: 'span', text: new Date(project.updatedAt).toLocaleDateString() },
          ]},
          { type: 'div', className: 'actions', children: [
            { type: 'button', text: 'Open', onClick: () => onOpen(project.id) },
            { type: 'button', text: 'Duplicate', onClick: () => onDuplicate(project.id) },
            { type: 'button', text: 'Delete', onClick: () => onDelete(project.id), className: 'btn-danger' },
          ]},
        ],
      }))},
    ],
  };
}

export default ProjectsPage;
