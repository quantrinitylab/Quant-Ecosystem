// ============================================================================
// QuantEdits - Canvas Component
// WYSIWYG design canvas with layer rendering and manipulation
// ============================================================================

import type { Layer, Project } from '../types';

interface CanvasProps {
  project: Project;
  layers: Layer[];
  selectedLayerId: string | null;
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  onLayerSelect: (layerId: string | null) => void;
  onLayerMove: (layerId: string, x: number, y: number) => void;
  onLayerResize: (layerId: string, width: number, height: number) => void;
  onLayerRotate: (layerId: string, angle: number) => void;
  onCanvasClick: (x: number, y: number) => void;
}

interface TransformHandle {
  position: string;
  cursor: string;
  x: number;
  y: number;
}

export function Canvas({ project, layers, selectedLayerId, zoom, panOffset, showGrid, snapToGrid, gridSize, onLayerSelect, onLayerMove, onLayerResize, onLayerRotate, onCanvasClick }: CanvasProps) {
  const canvasWidth = project.width * zoom;
  const canvasHeight = project.height * zoom;

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  const visibleLayers = layers.filter(l => l.visible).sort((a, b) => a.position.z - b.position.z);

  const getTransformHandles = (layer: Layer): TransformHandle[] => {
    const x = layer.position.x * zoom;
    const y = layer.position.y * zoom;
    const w = layer.size.width * zoom;
    const h = layer.size.height * zoom;
    return [
      { position: 'nw', cursor: 'nw-resize', x, y },
      { position: 'n', cursor: 'n-resize', x: x + w / 2, y },
      { position: 'ne', cursor: 'ne-resize', x: x + w, y },
      { position: 'e', cursor: 'e-resize', x: x + w, y: y + h / 2 },
      { position: 'se', cursor: 'se-resize', x: x + w, y: y + h },
      { position: 's', cursor: 's-resize', x: x + w / 2, y: y + h },
      { position: 'sw', cursor: 'sw-resize', x, y: y + h },
      { position: 'w', cursor: 'w-resize', x, y: y + h / 2 },
    ];
  };

  const snapValue = (value: number): number => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  };

  return {
    type: 'div',
    className: 'canvas-viewport',
    style: { overflow: 'hidden', position: 'relative' },
    children: [
      // Canvas background
      { type: 'div', className: 'canvas-bg', style: {
        width: canvasWidth, height: canvasHeight,
        transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }, onClick: (e: any) => onCanvasClick(e.x / zoom, e.y / zoom), children: [
        // Grid overlay
        showGrid ? { type: 'div', className: 'grid-overlay', style: {
          backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
          width: '100%', height: '100%',
        }} : null,
        // Rendered layers
        ...visibleLayers.map(layer => ({
          type: 'div',
          className: `canvas-layer layer-${layer.type} ${layer.id === selectedLayerId ? 'selected' : ''}`,
          style: {
            position: 'absolute',
            left: layer.position.x * zoom,
            top: layer.position.y * zoom,
            width: layer.size.width * zoom,
            height: layer.size.height * zoom,
            opacity: layer.opacity,
            transform: `rotate(${layer.rotation}deg) scale(${layer.scale.x}, ${layer.scale.y})`,
            mixBlendMode: layer.blendMode,
            zIndex: layer.position.z,
            pointerEvents: layer.locked ? 'none' : 'auto',
          },
          onClick: (e: any) => { e.stopPropagation(); onLayerSelect(layer.id); },
          children: [
            layer.type === 'text' && layer.content.text ? { type: 'div', className: 'text-layer', style: {
              fontFamily: layer.content.text.fontFamily,
              fontSize: layer.content.text.fontSize * zoom,
              fontWeight: layer.content.text.fontWeight,
              color: layer.content.text.color,
              textAlign: layer.content.text.alignment,
            }, text: layer.content.text.text } : null,
            layer.type === 'image' ? { type: 'img', src: layer.content.src, style: { width: '100%', height: '100%', objectFit: 'cover' } } : null,
            layer.type === 'shape' ? { type: 'div', className: `shape shape-${layer.content.shape?.type}`, style: {
              backgroundColor: layer.content.shape?.fill,
              border: `${layer.content.shape?.stroke.width}px solid ${layer.content.shape?.stroke.color}`,
              borderRadius: layer.content.shape?.type === 'circle' ? '50%' : `${layer.content.shape?.borderRadius || 0}px`,
              width: '100%', height: '100%',
            }} : null,
          ],
        })),
        // Selection box and transform handles
        selectedLayer ? {
          type: 'div',
          className: 'selection-box',
          style: {
            position: 'absolute',
            left: selectedLayer.position.x * zoom - 1,
            top: selectedLayer.position.y * zoom - 1,
            width: selectedLayer.size.width * zoom + 2,
            height: selectedLayer.size.height * zoom + 2,
            border: '2px solid #4f46e5',
            pointerEvents: 'none',
          },
          children: getTransformHandles(selectedLayer).map(handle => ({
            type: 'div',
            className: `transform-handle handle-${handle.position}`,
            style: { left: handle.x - selectedLayer.position.x * zoom, top: handle.y - selectedLayer.position.y * zoom, cursor: handle.cursor, width: 8, height: 8, backgroundColor: '#fff', border: '2px solid #4f46e5', position: 'absolute', pointerEvents: 'auto' },
          })),
        } : null,
      ]},
    ],
  };
}

export default Canvas;
