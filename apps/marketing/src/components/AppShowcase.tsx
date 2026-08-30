import React from 'react';

export interface AppInfo {
  name: string;
  description: string;
  icon: string;
  category: string;
}

export interface AppShowcaseProps {
  apps: AppInfo[];
  title?: string;
}

export const QUANT_APPS: AppInfo[] = [
  {
    name: 'Quant Mail',
    description: 'End-to-end encrypted email with AI-powered organization',
    icon: 'mail',
    category: 'Communication',
  },
  {
    name: 'Quant Drive',
    description: 'Local-first file storage with real-time collaboration',
    icon: 'drive',
    category: 'Storage',
  },
  {
    name: 'Quant Docs',
    description: 'Collaborative documents with offline-first editing',
    icon: 'docs',
    category: 'Productivity',
  },
  {
    name: 'Quant Calendar',
    description: 'Smart scheduling with AI assistant integration',
    icon: 'calendar',
    category: 'Productivity',
  },
  {
    name: 'Quant Meet',
    description: 'Privacy-first video conferencing with E2EE',
    icon: 'meet',
    category: 'Communication',
  },
  {
    name: 'Quant Chat',
    description: 'Real-time messaging with threads and reactions',
    icon: 'chat',
    category: 'Communication',
  },
  {
    name: 'Quant Tasks',
    description: 'Project management with AI prioritization',
    icon: 'tasks',
    category: 'Productivity',
  },
  {
    name: 'Quant Git',
    description: 'Cloud IDE with AI pair programming',
    icon: 'code',
    category: 'Development',
  },
  {
    name: 'Quant Sheets',
    description: 'Spreadsheets with formula AI and real-time sync',
    icon: 'sheets',
    category: 'Productivity',
  },
  {
    name: 'Quant Slides',
    description: 'Presentation builder with AI design suggestions',
    icon: 'slides',
    category: 'Productivity',
  },
  {
    name: 'Quant Photos',
    description: 'Photo storage with AI organization and editing',
    icon: 'photos',
    category: 'Storage',
  },
  {
    name: 'Quant Notes',
    description: 'Markdown notes with graph-based knowledge linking',
    icon: 'notes',
    category: 'Productivity',
  },
  {
    name: 'Quant Forms',
    description: 'Form builder with analytics and integrations',
    icon: 'forms',
    category: 'Productivity',
  },
];

export function AppShowcase({ apps, title }: AppShowcaseProps): React.ReactElement {
  return React.createElement(
    'section',
    { className: 'app-showcase' },
    title ? React.createElement('h2', { className: 'app-showcase-title' }, title) : null,
    React.createElement(
      'div',
      { className: 'app-showcase-grid' },
      apps.map((app) =>
        React.createElement(
          'div',
          { key: app.name, className: 'app-showcase-item' },
          React.createElement('div', { className: 'app-icon' }, app.icon),
          React.createElement('h3', null, app.name),
          React.createElement('p', null, app.description),
          React.createElement('span', { className: 'app-category' }, app.category),
        ),
      ),
    ),
  );
}
