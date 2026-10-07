// ============================================================================
// QuantAI - Plugin Card Component
// ============================================================================

import type { Plugin } from '../types';

interface PluginCardProps {
  plugin: Plugin;
  isInstalled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onConfigure: () => void;
}

export function PluginCard({
  plugin,
  isInstalled,
  onInstall,
  onUninstall,
  onConfigure,
}: PluginCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isInstalled ? 'border-green-700/50 bg-gray-800' : 'border-gray-700 bg-gray-800'
      }`}
      aria-label={`Plugin: ${plugin.name}${isInstalled ? ' (installed)' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white truncate">{plugin.name}</h3>
        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">v{plugin.version}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-300 mb-3 line-clamp-2">{plugin.description}</p>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
        <span>by {plugin.author}</span>
        <span>{plugin.installCount.toLocaleString()} installs</span>
        <span aria-label={`Rating: ${plugin.rating} out of 5`}>{plugin.rating}/5</span>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-4" aria-label="Plugin capabilities">
        {plugin.capabilities.map((cap) => (
          <span
            key={cap}
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-300"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isInstalled ? (
          <>
            <button
              type="button"
              onClick={onConfigure}
              className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-xs font-medium transition-colors"
              aria-label={`Configure ${plugin.name}`}
            >
              Configure
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg bg-red-900/50 text-red-300 hover:bg-red-800/50 text-xs font-medium transition-colors"
              aria-label={`Uninstall ${plugin.name}`}
            >
              Uninstall
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-xs font-medium transition-colors"
            aria-label={`Install ${plugin.name}`}
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}

export default PluginCard;
