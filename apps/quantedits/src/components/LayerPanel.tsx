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

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];

export function LayerPanel({ layers, selectedLayerId, onSelect, onToggleVisibility, onToggleLock, onReorder, onDelete, onDuplicate, onRename, onOpacityChange, onBlendModeChange }: LayerPanelProps) {
  const sortedLayers = [...layers].sort((a, b) => b.position.z - a.position.z);
  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return {
    type: 'div',
    className: 'layer-panel',
    children: [
      // Header with blend mode and opacity
      { type: 'div', className: 'layer-panel-header', children: [
        { type: 'select', className: 'blend-mode-select', value: selectedLayer?.blendMode || 'normal', onChange: (mode: BlendMode) => selectedLayerId && onBlendModeChange(selectedLayerId, mode), children: BLEND_MODES.map(mode => ({ type: 'option', value: mode, text: mode })) },
        { type: 'div', className: 'opacity-control', children: [
          { type: 'label', text: 'Opacity:' },
          { type: 'input', inputType: 'range', min: 0, max: 100, value: (selectedLayer?.opacity || 1) * 100, onChange: (v: number) => selectedLayerId && onOpacityChange(selectedLayerId, v / 100) },
          { type: 'span', text: `${Math.round((selectedLayer?.opacity || 1) * 100)}%` },
        ]},
      ]},
      // Layer list
      { type: 'div', className: 'layer-list', children: sortedLayers.map(layer => ({
        type: 'div',
        className: `layer-item ${layer.id === selectedLayerId ? 'selected' : ''} ${layer.locked ? 'locked' : ''}`,
        onClick: () => onSelect(layer.id),
        children: [
          { type: 'button', className: `visibility-btn ${layer.visible ? 'visible' : 'hidden'}`, onClick: (e: any) => { e.stopPropagation(); onToggleVisibility(layer.id); }, text: layer.visible ? 'V' : '-' },
          { type: 'div', className: 'layer-thumbnail', children: [
            { type: 'span', className: `layer-type-icon icon-${layer.type}` },
          ]},
          { type: 'span', className: 'layer-name', text: layer.name },
          { type: 'button', className: `lock-btn ${layer.locked ? 'locked' : ''}`, onClick: (e: any) => { e.stopPropagation(); onToggleLock(layer.id); }, text: layer.locked ? 'L' : 'U' },
        ],
      }))},
      // Actions
      { type: 'div', className: 'layer-actions', children: [
        { type: 'button', text: '+', title: 'New Layer', className: 'action-btn' },
        { type: 'button', text: 'D', title: 'Duplicate', className: 'action-btn', onClick: () => selectedLayerId && onDuplicate(selectedLayerId) },
        { type: 'button', text: 'X', title: 'Delete', className: 'action-btn danger', onClick: () => selectedLayerId && onDelete(selectedLayerId) },
      ]},
    ],
  };
}

export default LayerPanel;
