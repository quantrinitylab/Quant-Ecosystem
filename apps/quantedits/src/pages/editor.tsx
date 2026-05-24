// ============================================================================
// QuantEdits - Main Editor Page
// Full editing workspace with canvas, timeline, tools, and layers
// ============================================================================

import type { Project, Layer, Effect, AppliedEffect } from '../types';

interface EditorPageProps {
  project: Project;
  currentTime: number;
  selectedLayerId: string | null;
  zoom: number;
  onLayerSelect: (layerId: string) => void;
  onTimeChange: (time: number) => void;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  onAddLayer: (type: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onApplyEffect: (layerId: string, effect: Effect) => void;
  onExport: () => void;
  onSave: () => void;
}

interface EditorTool {
  id: string;
  name: string;
  icon: string;
  shortcut: string;
}

const EDITOR_TOOLS: EditorTool[] = [
  { id: 'select', name: 'Select', icon: 'cursor', shortcut: 'V' },
  { id: 'move', name: 'Move', icon: 'move', shortcut: 'M' },
  { id: 'text', name: 'Text', icon: 'type', shortcut: 'T' },
  { id: 'shape', name: 'Shape', icon: 'square', shortcut: 'S' },
  { id: 'pen', name: 'Pen', icon: 'pen-tool', shortcut: 'P' },
  { id: 'crop', name: 'Crop', icon: 'crop', shortcut: 'C' },
  { id: 'eraser', name: 'Eraser', icon: 'eraser', shortcut: 'E' },
  { id: 'hand', name: 'Hand', icon: 'hand', shortcut: 'H' },
  { id: 'zoom', name: 'Zoom', icon: 'zoom-in', shortcut: 'Z' },
];

export function EditorPage({ project, currentTime, selectedLayerId, zoom, onLayerSelect, onTimeChange, onLayerUpdate, onAddLayer, onDeleteLayer, onApplyEffect, onExport, onSave }: EditorPageProps) {
  const selectedLayer = project.layers.find(l => l.id === selectedLayerId) || null;
  const visibleLayers = project.layers.filter(l => l.visible && currentTime >= l.startTime && currentTime <= l.endTime);

  return {
    type: 'div',
    className: 'editor-workspace',
    children: [
      // Top toolbar
      { type: 'div', className: 'editor-toolbar', children: [
        { type: 'div', className: 'toolbar-left', children: [
          { type: 'button', text: 'File', className: 'toolbar-btn' },
          { type: 'button', text: 'Edit', className: 'toolbar-btn' },
          { type: 'button', text: 'View', className: 'toolbar-btn' },
        ]},
        { type: 'div', className: 'toolbar-center', children: [
          { type: 'span', text: project.title, className: 'project-title' },
          { type: 'span', text: `v${project.version}`, className: 'version-badge' },
        ]},
        { type: 'div', className: 'toolbar-right', children: [
          { type: 'button', text: 'Save', onClick: onSave, className: 'btn-save' },
          { type: 'button', text: 'Export', onClick: onExport, className: 'btn-export' },
        ]},
      ]},
      // Main content area
      { type: 'div', className: 'editor-main', children: [
        // Left tool panel
        { type: 'div', className: 'tool-sidebar', children: EDITOR_TOOLS.map(tool => ({
          type: 'button',
          className: 'tool-btn',
          title: `${tool.name} (${tool.shortcut})`,
          children: [{ type: 'span', className: `icon-${tool.icon}` }],
        }))},
        // Canvas area
        { type: 'div', className: 'canvas-container', children: [
          { type: 'div', className: 'canvas', style: { width: project.width * zoom, height: project.height * zoom }, children: visibleLayers.map(layer => ({
            type: 'div',
            className: `layer-render layer-${layer.type}`,
            style: { left: layer.position.x * zoom, top: layer.position.y * zoom, width: layer.size.width * zoom, height: layer.size.height * zoom, opacity: layer.opacity, transform: `rotate(${layer.rotation}deg) scale(${layer.scale.x}, ${layer.scale.y})`, zIndex: layer.position.z },
            onClick: () => onLayerSelect(layer.id),
            'data-layer-id': layer.id,
          }))},
        ]},
        // Right panel (layers + properties)
        { type: 'div', className: 'right-panel', children: [
          { type: 'div', className: 'layers-panel', children: [
            { type: 'h3', text: 'Layers' },
            { type: 'div', className: 'layer-list', children: project.layers.map(layer => ({
              type: 'div',
              className: `layer-item ${layer.id === selectedLayerId ? 'selected' : ''}`,
              onClick: () => onLayerSelect(layer.id),
              children: [
                { type: 'span', className: `icon-${layer.type}` },
                { type: 'span', text: layer.name },
                { type: 'button', text: layer.visible ? 'eye' : 'eye-off', onClick: () => onLayerUpdate(layer.id, { visible: !layer.visible }) },
                { type: 'button', text: 'x', onClick: () => onDeleteLayer(layer.id) },
              ],
            }))},
            { type: 'div', className: 'add-layer-btns', children: [
              { type: 'button', text: '+ Text', onClick: () => onAddLayer('text') },
              { type: 'button', text: '+ Image', onClick: () => onAddLayer('image') },
              { type: 'button', text: '+ Shape', onClick: () => onAddLayer('shape') },
              { type: 'button', text: '+ Video', onClick: () => onAddLayer('video') },
            ]},
          ]},
          selectedLayer ? { type: 'div', className: 'properties-panel', children: [
            { type: 'h3', text: 'Properties' },
            { type: 'label', text: 'Opacity' },
            { type: 'input', inputType: 'range', min: 0, max: 1, step: 0.01, value: selectedLayer.opacity },
            { type: 'label', text: 'Blend Mode' },
            { type: 'select', value: selectedLayer.blendMode },
            { type: 'label', text: 'Position' },
            { type: 'div', children: [
              { type: 'input', inputType: 'number', value: selectedLayer.position.x, label: 'X' },
              { type: 'input', inputType: 'number', value: selectedLayer.position.y, label: 'Y' },
            ]},
            { type: 'label', text: 'Size' },
            { type: 'div', children: [
              { type: 'input', inputType: 'number', value: selectedLayer.size.width, label: 'W' },
              { type: 'input', inputType: 'number', value: selectedLayer.size.height, label: 'H' },
            ]},
            { type: 'label', text: 'Rotation' },
            { type: 'input', inputType: 'number', value: selectedLayer.rotation, label: 'deg' },
          ]} : null,
        ]},
      ]},
      // Timeline
      { type: 'div', className: 'timeline-panel', children: [
        { type: 'div', className: 'timeline-controls', children: [
          { type: 'button', text: '|<', title: 'Start' },
          { type: 'button', text: '<', title: 'Previous frame' },
          { type: 'button', text: 'Play', title: 'Play/Pause' },
          { type: 'button', text: '>', title: 'Next frame' },
          { type: 'button', text: '>|', title: 'End' },
          { type: 'span', text: `${currentTime.toFixed(2)}s / ${project.duration.toFixed(2)}s` },
        ]},
        { type: 'div', className: 'timeline-tracks', children: project.timeline.tracks.map(track => ({
          type: 'div',
          className: `track track-${track.type}`,
          children: [
            { type: 'div', className: 'track-header', children: [{ type: 'span', text: track.name }] },
            { type: 'div', className: 'track-clips', children: track.clips.map(clip => ({
              type: 'div',
              className: 'clip',
              style: { left: `${(clip.startTime / project.duration) * 100}%`, width: `${((clip.endTime - clip.startTime) / project.duration) * 100}%` },
            }))},
          ],
        }))},
        { type: 'div', className: 'playhead', style: { left: `${(currentTime / (project.duration || 1)) * 100}%` } },
      ]},
    ],
  };
}

export default EditorPage;
