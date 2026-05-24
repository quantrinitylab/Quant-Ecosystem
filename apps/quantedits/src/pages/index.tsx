// ============================================================================
// QuantEdits - Dashboard Page
// Project overview, recent projects, quick actions
// ============================================================================

import type { Project } from '../types';

interface DashboardProps {
  userId: string;
  projects: Project[];
  onNewProject: (type: string) => void;
  onOpenProject: (id: string) => void;
}

interface ProjectPreset {
  type: string;
  name: string;
  width: number;
  height: number;
  icon: string;
}

const PROJECT_PRESETS: ProjectPreset[] = [
  { type: 'video', name: 'Video', width: 1920, height: 1080, icon: 'film' },
  { type: 'story', name: 'Story/Reel', width: 1080, height: 1920, icon: 'smartphone' },
  { type: 'design', name: 'Design', width: 1080, height: 1080, icon: 'layout' },
  { type: 'presentation', name: 'Presentation', width: 1920, height: 1080, icon: 'monitor' },
  { type: 'photo', name: 'Photo Edit', width: 4000, height: 3000, icon: 'image' },
  { type: 'reel', name: 'Short Video', width: 1080, height: 1920, icon: 'play-circle' },
];

export function DashboardPage({ userId, projects, onNewProject, onOpenProject }: DashboardProps) {
  const recentProjects = projects.slice(0, 8);
  const stats = {
    total: projects.length,
    videos: projects.filter(p => p.type === 'video' || p.type === 'reel').length,
    designs: projects.filter(p => p.type === 'design' || p.type === 'photo').length,
  };

  return {
    type: 'div',
    className: 'dashboard',
    children: [
      { type: 'header', className: 'dashboard-header', children: [
        { type: 'h1', text: 'QuantEdits' },
        { type: 'p', text: `Welcome back! You have ${stats.total} projects.` },
      ]},
      { type: 'section', className: 'quick-create', children: [
        { type: 'h2', text: 'Create New' },
        { type: 'div', className: 'preset-grid', children: PROJECT_PRESETS.map(preset => ({
          type: 'button',
          className: 'preset-card',
          onClick: () => onNewProject(preset.type),
          children: [
            { type: 'span', className: `icon-${preset.icon}` },
            { type: 'span', text: preset.name },
            { type: 'small', text: `${preset.width}x${preset.height}` },
          ],
        }))},
      ]},
      { type: 'section', className: 'recent-projects', children: [
        { type: 'h2', text: 'Recent Projects' },
        { type: 'div', className: 'project-grid', children: recentProjects.map(project => ({
          type: 'div',
          className: 'project-card',
          onClick: () => onOpenProject(project.id),
          children: [
            { type: 'div', className: 'project-thumbnail', style: { backgroundImage: `url(${project.thumbnail || '/placeholder.png'})` } },
            { type: 'h3', text: project.title },
            { type: 'p', text: `${project.type} - ${new Date(project.updatedAt).toLocaleDateString()}` },
          ],
        }))},
      ]},
    ],
  };
}

export default DashboardPage;
