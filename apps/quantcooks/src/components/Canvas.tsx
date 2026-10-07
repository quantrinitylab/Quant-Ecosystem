// ============================================================================
// QuantEdits - Canvas Component
// 2D canvas with shapes, text, images, selection handles, alignment, grid, rulers
// ============================================================================

import React, { useState, useCallback, useRef, useMemo } from 'react';

interface CanvasElement {
  id: string;
  type: 'rect' | 'circle' | 'triangle' | 'line' | 'arrow' | 'text' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  imageUrl?: string;
}

interface CanvasProps {
  elements: CanvasElement[];
  selectedIds: Set<string>;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  showGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  backgroundColor: string;
  onSelectElement: (id: string, addToSelection?: boolean) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onResizeElement: (id: string, width: number, height: number) => void;
  onRotateElement: (id: string, rotation: number) => void;
  onDeselectAll: () => void;
}

interface AlignLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
}

const Canvas: React.FC<CanvasProps> = ({
  elements,
  selectedIds,
  canvasWidth,
  canvasHeight,
  zoom,
  showGrid,
  gridSize,
  showRulers,
  backgroundColor,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onRotateElement,
  onDeselectAll,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [elementStart, setElementStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>('');
  const [alignLines, setAlignLines] = useState<AlignLine[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedElements = useMemo(() => elements.filter(e => selectedIds.has(e.id)), [elements, selectedIds]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-background')) {
      onDeselectAll();
    }
  }, [onDeselectAll]);

  const handleElementMouseDown = useCallback((e: React.MouseEvent, element: CanvasElement) => {
    if (element.locked) return;
    e.stopPropagation();
    onSelectElement(element.id, e.ctrlKey || e.metaKey);
    setIsDragging(true);
    setDragTarget(element.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setElementStart({ x: element.x, y: element.y });
  }, [onSelectElement]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, elementId: string, handle: string) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragTarget(elementId);
    setResizeHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
    const el = elements.find(el => el.id === elementId);
    if (el) setElementStart({ x: el.width, y: el.height });
  }, [elements]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragTarget) return;
    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;

    if (isDragging) {
      let newX = elementStart.x + dx;
      let newY = elementStart.y + dy;
      const snapThreshold = 5 / zoom;
      const lines: AlignLine[] = [];
      const centerX = newX + (selectedElements[0]?.width || 0) / 2;
      const centerY = newY + (selectedElements[0]?.height || 0) / 2;
      if (Math.abs(centerX - canvasWidth / 2) < snapThreshold) {
        newX = canvasWidth / 2 - (selectedElements[0]?.width || 0) / 2;
        lines.push({ orientation: 'vertical', position: canvasWidth / 2 });
      }
      if (Math.abs(centerY - canvasHeight / 2) < snapThreshold) {
        newY = canvasHeight / 2 - (selectedElements[0]?.height || 0) / 2;
        lines.push({ orientation: 'horizontal', position: canvasHeight / 2 });
      }
      elements.forEach(el => {
        if (el.id === dragTarget) return;
        if (Math.abs(newX - el.x) < snapThreshold) { newX = el.x; lines.push({ orientation: 'vertical', position: el.x }); }
        if (Math.abs(newY - el.y) < snapThreshold) { newY = el.y; lines.push({ orientation: 'horizontal', position: el.y }); }
      });
      setAlignLines(lines);
      onMoveElement(dragTarget, newX, newY);
    } else if (isResizing) {
      let newWidth = elementStart.x;
      let newHeight = elementStart.y;
      if (resizeHandle.includes('r') || resizeHandle === 'br' || resizeHandle === 'tr') newWidth = Math.max(10, elementStart.x + dx);
      if (resizeHandle.includes('l') || resizeHandle === 'bl' || resizeHandle === 'tl') newWidth = Math.max(10, elementStart.x - dx);
      if (resizeHandle.includes('b') || resizeHandle === 'br' || resizeHandle === 'bl') newHeight = Math.max(10, elementStart.y + dy);
      if (resizeHandle.includes('t') || resizeHandle === 'tr' || resizeHandle === 'tl') newHeight = Math.max(10, elementStart.y - dy);
      onResizeElement(dragTarget, newWidth, newHeight);
    }
  }, [dragTarget, isDragging, isResizing, dragStart, elementStart, zoom, resizeHandle, elements, canvasWidth, canvasHeight, selectedElements, onMoveElement, onResizeElement]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setDragTarget(null);
    setAlignLines([]);
  }, []);

  const renderElement = useCallback((element: CanvasElement) => {
    const style: React.CSSProperties = {
      position: 'absolute',
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      transform: `rotate(${element.rotation}deg)`,
      opacity: element.opacity,
      cursor: element.locked ? 'default' : 'move',
    };

    const isSelected = selectedIds.has(element.id);

    return (
      <div key={element.id} className={`canvas-element ${isSelected ? 'selected' : ''}`} style={style} onMouseDown={(e) => handleElementMouseDown(e, element)}>
        {element.type === 'rect' && (
          <div className="shape-rect" style={{ width: '100%', height: '100%', backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.stroke}` : 'none', borderRadius: 0 }} />
        )}
        {element.type === 'circle' && (
          <div className="shape-circle" style={{ width: '100%', height: '100%', backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.stroke}` : 'none', borderRadius: '50%' }} />
        )}
        {element.type === 'triangle' && (
          <div className="shape-triangle" style={{ width: 0, height: 0, borderLeft: `${element.width / 2}px solid transparent`, borderRight: `${element.width / 2}px solid transparent`, borderBottom: `${element.height}px solid ${element.fill}` }} />
        )}
        {element.type === 'text' && (
          <div className="text-element" style={{ fontSize: element.fontSize, fontFamily: element.fontFamily, color: element.fill }}>{element.text}</div>
        )}
        {element.type === 'image' && element.imageUrl && (
          <img src={element.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {element.type === 'line' && (
          <svg width="100%" height="100%"><line x1="0" y1={element.height / 2} x2={element.width} y2={element.height / 2} stroke={element.stroke || element.fill} strokeWidth={element.strokeWidth || 2} /></svg>
        )}
        {element.type === 'arrow' && (
          <svg width="100%" height="100%"><line x1="0" y1={element.height / 2} x2={element.width - 10} y2={element.height / 2} stroke={element.stroke || element.fill} strokeWidth={element.strokeWidth || 2} /><polygon points={`${element.width},${element.height / 2} ${element.width - 12},${element.height / 2 - 6} ${element.width - 12},${element.height / 2 + 6}`} fill={element.stroke || element.fill} /></svg>
        )}
        {isSelected && !element.locked && (
          <div className="selection-frame">
            {['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'].map(handle => (
              <div key={handle} className={`resize-handle handle-${handle}`} onMouseDown={(e) => handleResizeMouseDown(e, element.id, handle)} />
            ))}
            <div className="rotation-handle" />
          </div>
        )}
      </div>
    );
  }, [selectedIds, handleElementMouseDown, handleResizeMouseDown]);

  const rulerTicks = useMemo(() => {
    const ticks: number[] = [];
    const interval = gridSize;
    for (let i = 0; i <= Math.max(canvasWidth, canvasHeight); i += interval) ticks.push(i);
    return ticks;
  }, [canvasWidth, canvasHeight, gridSize]);

  return (
    <div className="canvas-wrapper" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {showRulers && (
        <>
          <div className="ruler-h">
            {rulerTicks.filter(t => t <= canvasWidth).map(t => (<div key={t} className="ruler-tick" style={{ left: t * zoom }}><span>{t}</span></div>))}
          </div>
          <div className="ruler-v">
            {rulerTicks.filter(t => t <= canvasHeight).map(t => (<div key={t} className="ruler-tick" style={{ top: t * zoom }}><span>{t}</span></div>))}
          </div>
        </>
      )}
      <div className="canvas-viewport" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <div ref={canvasRef} className="canvas-surface" style={{ width: canvasWidth, height: canvasHeight, backgroundColor }} onClick={handleCanvasClick}>
          {showGrid && (
            <div className="grid-overlay" style={{ backgroundSize: `${gridSize}px ${gridSize}px`, backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)` }} />
          )}
          {alignLines.map((line, i) => (
            <div key={i} className={`align-guide align-${line.orientation}`} style={line.orientation === 'vertical' ? { left: line.position, top: 0, height: '100%' } : { top: line.position, left: 0, width: '100%' }} />
          ))}
          {elements.filter(e => e.visible).map(renderElement)}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
