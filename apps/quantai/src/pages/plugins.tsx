// ============================================================================
// QuantAI - Plugin Marketplace Page
// ============================================================================

import type { Plugin } from '../types';

interface PluginsPageProps { plugins: Plugin[]; installed: Plugin[]; onInstall: (id: string) => void; onUninstall: (id: string) => void; }

export function PluginsPage({ plugins, installed, onInstall, onUninstall }: PluginsPageProps) {
  const installedIds = new Set(installed.map(p => p.id));
  return { type: 'div', className: 'plugins-page', children: [
    { type: 'h1', text: 'Plugin Marketplace' },
    installed.length > 0 ? { type: 'section', children: [{ type: 'h2', text: 'Installed' }, { type: 'div', className: 'plugin-grid', children: installed.map(p => ({ type: 'div', className: 'plugin-card installed', children: [{ type: 'h3', text: p.name }, { type: 'p', text: p.description }, { type: 'button', text: 'Uninstall', onClick: () => onUninstall(p.id) }] }))} ] } : null,
    { type: 'section', children: [{ type: 'h2', text: 'Available' }, { type: 'div', className: 'plugin-grid', children: plugins.filter(p => !installedIds.has(p.id)).map(p => ({ type: 'div', className: 'plugin-card', children: [{ type: 'h3', text: p.name }, { type: 'p', text: p.description }, { type: 'span', text: `${p.installCount} installs` }, { type: 'button', text: 'Install', onClick: () => onInstall(p.id) }] }))} ] },
  ]};
}

export default PluginsPage;
