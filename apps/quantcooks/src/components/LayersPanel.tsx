// ============================================================================
// QuantEdits - Layers Panel Component
// Layer list, visibility, lock, blend modes, groups, drag reorder
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface Layer {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'image' | 'shape' | 'effect' | 'group';
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  thumbnail: string;
  parentGroupId: string | null;
  children?: Layer[];
  isExpanded: boolean;
  color: string;
}

interface LayersPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onReorder: (dragId: string, dropId: string, position: 'above' | 'below' | 'inside') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onGroupSelected: (ids: string[]) => void;
  onUngroupLayer: (id: string) => void;
  onUpdateOpacity: (id: string, opacity: number) => void;
  onUpdateBlendMode: (id: string, mode: string) => void;
}

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

const LayerItem: React.FC<{
  layer: Layer;
  depth: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (position: 'above' | 'below') => void;
}> = ({ layer, depth, isSelected, onSelect, onToggleVisibility, onToggleLock, onDuplicate, onDelete, onRename, onDragStart, onDragOver, onDrop }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);

  const handleDoubleClick = useCallback(() => {
    setIsRenaming(true);
    setEditName(layer.name);
  }, [layer.name]);

  const handleRenameSubmit = useCallback(() => {
    if (editName.trim()) onRename(editName.trim());
    setIsRenaming(false);
  }, [editName, onRename]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDropPosition(y < rect.height / 2 ? 'above' : 'below');
    onDragOver(e);
  }, [onDragOver]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropPosition) onDrop(dropPosition);
    setDropPosition(null);
  }, [dropPosition, onDrop]);

  const typeIcon = useMemo(() => {
    switch (layer.type) {
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'text': return 'T';
      case 'image': return '🖼';
      case 'shape': return '◆';
      case 'effect': return '✨';
      case 'group': return '📁';
      default: return '●';
    }
  }, [layer.type]);

  return (
    <div
      className={`layer-item ${isSelected ? 'selected' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable={!layer.locked}
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={() => setDropPosition(null)}
    >
      <button className="visibility-btn" onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }} title={layer.visible ? 'Hide' : 'Show'}>
        {layer.visible ? '👁' : '◌'}
      </button>
      <span className="layer-color" style={{ backgroundColor: layer.color }} />
      <span className="layer-type-icon">{typeIcon}</span>
      {layer.thumbnail && layer.type !== 'group' && (
        <img src={layer.thumbnail} alt="" className="layer-thumb" />
      )}
      {isRenaming ? (
        <input
          type="text"
          className="rename-input"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsRenaming(false); }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="layer-name">{layer.name}</span>
      )}
      <div className="layer-right">
        <button className="lock-btn" onClick={(e) => { e.stopPropagation(); onToggleLock(); }} title={layer.locked ? 'Unlock' : 'Lock'}>
          {layer.locked ? '🔒' : '🔓'}
        </button>
      </div>
      {showContextMenu && (
        <div className="layer-context-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { onDuplicate(); setShowContextMenu(false); }}>Duplicate</button>
          <button onClick={() => { setIsRenaming(true); setShowContextMenu(false); }}>Rename</button>
          <button onClick={() => { onToggleLock(); setShowContextMenu(false); }}>{layer.locked ? 'Unlock' : 'Lock'}</button>
          <button onClick={() => { onToggleVisibility(); setShowContextMenu(false); }}>{layer.visible ? 'Hide' : 'Show'}</button>
          <div className="context-divider" />
          <button className="delete-option" onClick={() => { onDelete(); setShowContextMenu(false); }}>Delete</button>
        </div>
      )}
    </div>
  );
};

const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onReorder,
  onDuplicate,
  onDelete,
  onRename,
  onGroupSelected,
  onUngroupLayer,
  onUpdateOpacity,
  onUpdateBlendMode,
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const selectedLayer = useMemo(() => layers.find(l => l.id === selectedLayerId), [layers, selectedLayerId]);

  const filteredLayers = useMemo(() => {
    if (!searchQuery) return layers;
    return layers.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [layers, searchQuery]);

  const handleMultiSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setMultiSelect(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setMultiSelect(new Set());
      onSelectLayer(id);
    }
  }, [onSelectLayer]);

  const handleGroupSelected = useCallback(() => {
    if (multiSelect.size > 1) {
      onGroupSelected(Array.from(multiSelect));
      setMultiSelect(new Set());
    }
  }, [multiSelect, onGroupSelected]);

  const renderLayers = useCallback((layerList: Layer[], depth: number = 0): React.ReactNode[] => {
    return layerList.map(layer => (
      <React.Fragment key={layer.id}>
        <LayerItem
          layer={layer}
          depth={depth}
          isSelected={selectedLayerId === layer.id || multiSelect.has(layer.id)}
          onSelect={() => onSelectLayer(layer.id)}
          onToggleVisibility={() => onToggleVisibility(layer.id)}
          onToggleLock={() => onToggleLock(layer.id)}
          onDuplicate={() => onDuplicate(layer.id)}
          onDelete={() => onDelete(layer.id)}
          onRename={(name) => onRename(layer.id, name)}
          onDragStart={() => setDraggedId(layer.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(position) => { if (draggedId && draggedId !== layer.id) onReorder(draggedId, layer.id, position); setDraggedId(null); }}
        />
        {layer.type === 'group' && layer.isExpanded && layer.children && renderLayers(layer.children, depth + 1)}
      </React.Fragment>
    ));
  }, [selectedLayerId, multiSelect, draggedId, onSelectLayer, onToggleVisibility, onToggleLock, onDuplicate, onDelete, onRename, onReorder]);

  return (
    <div className="layers-panel">
      <div className="layers-header">
        <h3>Layers</h3>
        <div className="layers-actions">
          <button className="group-btn" onClick={handleGroupSelected} disabled={multiSelect.size < 2} title="Group selected">
            Group
          </button>
          {selectedLayer?.type === 'group' && (
            <button className="ungroup-btn" onClick={() => onUngroupLayer(selectedLayer.id)} title="Ungroup">
              Ungroup
            </button>
          )}
        </div>
      </div>

      <div className="layers-search">
        <input type="text" placeholder="Search layers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {selectedLayer && (
        <div className="layer-properties">
          <div className="prop-row">
            <label>Opacity</label>
            <input type="range" min={0} max={100} value={Math.round(selectedLayer.opacity * 100)} onChange={(e) => onUpdateOpacity(selectedLayer.id, parseInt(e.target.value) / 100)} />
            <span>{Math.round(selectedLayer.opacity * 100)}%</span>
          </div>
          <div className="prop-row">
            <label>Blend</label>
            <select value={selectedLayer.blendMode} onChange={(e) => onUpdateBlendMode(selectedLayer.id, e.target.value)}>
              {BLEND_MODES.map(mode => (<option key={mode} value={mode}>{mode}</option>))}
            </select>
          </div>
        </div>
      )}

      <div className="layers-list">
        {filteredLayers.length === 0 ? (
          <div className="empty-layers">
            <p>No layers</p>
          </div>
        ) : (
          renderLayers(filteredLayers)
        )}
      </div>

      <div className="layers-footer">
        <span className="layer-count">{layers.length} layers</span>
        <span className="selected-count">
          {multiSelect.size > 0 ? `${multiSelect.size} selected` : selectedLayerId ? '1 selected' : ''}
        </span>
      </div>
    </div>
  );
};

export default LayersPanel;
