// ============================================================================
// QuantAI - Plugin Card Component
// ============================================================================

import type { Plugin } from '../types';

interface PluginCardProps { plugin: Plugin; isInstalled: boolean; onInstall: () => void; onUninstall: () => void; onConfigure: () => void; }

export function PluginCard({ plugin, isInstalled, onInstall, onUninstall, onConfigure }: PluginCardProps) {
  return { type: 'div', className: `plugin-card ${isInstalled ? 'installed' : ''}`, children: [
    { type: 'div', className: 'plugin-header', children: [{ type: 'h3', text: plugin.name }, { type: 'span', text: `v${plugin.version}`, className: 'version' }] },
    { type: 'p', text: plugin.description },
    { type: 'div', className: 'plugin-meta', children: [{ type: 'span', text: `by ${plugin.author}` }, { type: 'span', text: `${plugin.installCount.toLocaleString()} installs` }, { type: 'span', text: `${plugin.rating}/5` }] },
    { type: 'div', className: 'plugin-caps', children: plugin.capabilities.map(c => ({ type: 'span', className: 'cap-tag', text: c })) },
    { type: 'div', className: 'plugin-actions', children: [
      isInstalled ? { type: 'button', text: 'Configure', onClick: onConfigure } : null,
      isInstalled ? { type: 'button', text: 'Uninstall', onClick: onUninstall, className: 'btn-danger' } : { type: 'button', text: 'Install', onClick: onInstall, className: 'btn-primary' },
    ]},
  ]};
}

export default PluginCard;
