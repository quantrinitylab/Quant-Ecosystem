// ============================================================================
// QuantEdits - Layer Panel Component
// Layer management: visibility, locking, reorder, blend modes
// ============================================================================

import type { Layer, BlendMode } from '../types';

interface LayerPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onReorder: (layerIds: string[]) => void;
  onDelete: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onBlendModeChange: (layerId: string, mode: BlendMode) => void;
}

const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
];

export function LayerPanel({
  layers,
  selectedLayerId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  // TODO: wire up handlers
  onReorder: _onReorder,
  onDelete,
  onDuplicate,
  onRename: _onRename,
  onOpacityChange,
  onBlendModeChange,
}: LayerPanelProps) {
  const sortedLayers = [...layers].sort((a, b) => b.position.z - a.position.z);
  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  return (
    <section className="flex flex-col h-full bg-gray-900 text-white" aria-label="Layer panel">
      {/* Header with blend mode and opacity */}
      <div className="p-3 border-b border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="blend-mode-select" className="sr-only">
            Blend mode
          </label>
          <select
            id="blend-mode-select"
            value={selectedLayer?.blendMode || 'normal'}
            onChange={(e) =>
              selectedLayerId && onBlendModeChange(selectedLayerId, e.target.value as BlendMode)
            }
            className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-sm text-white min-h-[44px]"
            aria-label="Blend mode"
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="layer-opacity" className="text-xs text-gray-400 w-14">
            Opacity:
          </label>
          <input
            id="layer-opacity"
            type="range"
            min={0}
            max={100}
            value={Math.round((selectedLayer?.opacity ?? 1) * 100)}
            onChange={(e) =>
              selectedLayerId && onOpacityChange(selectedLayerId, Number(e.target.value) / 100)
            }
            className="flex-1 accent-blue-500"
            aria-label="Layer opacity"
          />
          <span className="text-xs text-gray-400 w-8 text-right">
            {Math.round((selectedLayer?.opacity ?? 1) * 100)}%
          </span>
        </div>
      </div>

      {/* Layer List */}
      <ul className="flex-1 overflow-y-auto" aria-label="Layers list">
        {sortedLayers.map((layer) => (
          <li
            key={layer.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(layer.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(layer.id);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-800 ${
              layer.id === selectedLayerId ? 'bg-blue-900/40' : 'hover:bg-gray-800'
            } ${layer.locked ? 'opacity-70' : ''}`}
            aria-selected={layer.id === selectedLayerId}
            aria-label={`Layer: ${layer.name}`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(layer.id);
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-xs hover:bg-gray-700"
              aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
            >
              {layer.visible ? '👁' : '—'}
            </button>

            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-xs text-gray-400">
              <span aria-hidden="true">{layer.type.charAt(0).toUpperCase()}</span>
            </div>

            <span className="flex-1 text-sm truncate">{layer.name}</span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(layer.id);
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-xs hover:bg-gray-700"
              aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
            >
              {layer.locked ? '🔒' : '🔓'}
            </button>
          </li>
        ))}
      </ul>

      {/* Layer Actions */}
      <div
        className="flex items-center gap-1 p-2 border-t border-gray-700"
        aria-label="Layer actions"
      >
        <button
          type="button"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-sm"
          aria-label="New layer"
          title="New Layer"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => selectedLayerId && onDuplicate(selectedLayerId)}
          disabled={!selectedLayerId}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Duplicate layer"
          title="Duplicate"
        >
          D
        </button>
        <button
          type="button"
          onClick={() => selectedLayerId && onDelete(selectedLayerId)}
          disabled={!selectedLayerId}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-red-900/50 hover:bg-red-800 text-sm text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Delete layer"
          title="Delete"
        >
          X
        </button>
      </div>
    </section>
  );
}

export default LayerPanel;
