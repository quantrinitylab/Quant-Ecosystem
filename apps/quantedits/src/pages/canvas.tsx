// ============================================================================
// QuantEdits - Canvas Design Editor (Canva-like)
// Canvas with zoom/pan, elements panel, properties, alignment, layers, presets
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface CanvasElement {
  id: string;
  type: 'text' | 'shape' | 'image' | 'icon' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  name: string;
  zIndex: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  shadow: { x: number; y: number; blur: number; color: string } | null;
  text?: { content: string; fontSize: number; fontFamily: string; fontWeight: string; textAlign: string; color: string; lineHeight: number };
  shape?: 'rect' | 'circle' | 'triangle' | 'line' | 'arrow' | 'star' | 'polygon';
  imageUrl?: string;
}

interface CanvasSize {
  name: string;
  width: number;
  height: number;
  platform: string;
}

interface CanvasEditorProps {
  projectId: string;
}

type ToolMode = 'select' | 'text' | 'shape' | 'draw' | 'pan';

const SIZE_PRESETS: CanvasSize[] = [
  { name: 'Instagram Post', width: 1080, height: 1080, platform: 'Instagram' },
  { name: 'Instagram Story', width: 1080, height: 1920, platform: 'Instagram' },
  { name: 'Facebook Post', width: 1200, height: 630, platform: 'Facebook' },
  { name: 'Facebook Cover', width: 820, height: 312, platform: 'Facebook' },
  { name: 'Twitter Post', width: 1200, height: 675, platform: 'Twitter' },
  { name: 'Twitter Header', width: 1500, height: 500, platform: 'Twitter' },
  { name: 'YouTube Thumbnail', width: 1280, height: 720, platform: 'YouTube' },
  { name: 'YouTube Banner', width: 2560, height: 1440, platform: 'YouTube' },
  { name: 'Custom', width: 1920, height: 1080, platform: 'Custom' },
];

const SHAPE_OPTIONS = ['rect', 'circle', 'triangle', 'line', 'arrow', 'star', 'polygon'] as const;

const CanvasEditor: React.FC<CanvasEditorProps> = ({ projectId }) => {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(SIZE_PRESETS[0]);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clipboard, setClipboard] = useState<CanvasElement | null>(null);
  const [showSizePresets, setShowSizePresets] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState<'elements' | 'text' | 'shapes' | 'uploads' | 'backgrounds'>('elements');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showAlignGuides, setShowAlignGuides] = useState(false);
  const [alignGuides, setAlignGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedElement = useMemo(() => elements.find(e => e.id === selectedId) || null, [elements, selectedId]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setElements([
        { id: 'el-1', type: 'shape', x: 100, y: 100, width: 400, height: 300, rotation: 0, opacity: 1, locked: false, visible: true, name: 'Background Shape', zIndex: 0, fill: '#6366f1', stroke: '', strokeWidth: 0, borderRadius: 16, shadow: null, shape: 'rect' },
        { id: 'el-2', type: 'text', x: 200, y: 200, width: 300, height: 60, rotation: 0, opacity: 1, locked: false, visible: true, name: 'Heading', zIndex: 1, fill: 'transparent', stroke: '', strokeWidth: 0, borderRadius: 0, shadow: null, text: { content: 'Hello World', fontSize: 48, fontFamily: 'Inter', fontWeight: 'bold', textAlign: 'center', color: '#ffffff', lineHeight: 1.2 } },
      ]);
      setHistory([]);
      setHistoryIndex(-1);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [projectId]);

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(elements))]);
    setHistoryIndex(prev => prev + 1);
  }, [elements, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setElements(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setElements(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleAddText = useCallback(() => {
    saveHistory();
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`, type: 'text', x: canvasSize.width / 2 - 100, y: canvasSize.height / 2 - 20, width: 200, height: 40, rotation: 0, opacity: 1, locked: false, visible: true, name: `Text ${elements.length + 1}`, zIndex: elements.length, fill: 'transparent', stroke: '', strokeWidth: 0, borderRadius: 0, shadow: null,
      text: { content: 'New Text', fontSize: 24, fontFamily: 'Inter', fontWeight: 'normal', textAlign: 'left', color: '#000000', lineHeight: 1.4 },
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
  }, [elements, canvasSize, saveHistory]);

  const handleAddShape = useCallback((shape: typeof SHAPE_OPTIONS[number]) => {
    saveHistory();
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`, type: 'shape', x: canvasSize.width / 2 - 50, y: canvasSize.height / 2 - 50, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, visible: true, name: `${shape} ${elements.length + 1}`, zIndex: elements.length, fill: '#10b981', stroke: '#000000', strokeWidth: 0, borderRadius: shape === 'circle' ? 50 : 0, shadow: null, shape,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
  }, [elements, canvasSize, saveHistory]);

  const handleAddImage = useCallback((url: string) => {
    saveHistory();
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`, type: 'image', x: canvasSize.width / 2 - 150, y: canvasSize.height / 2 - 100, width: 300, height: 200, rotation: 0, opacity: 1, locked: false, visible: true, name: `Image ${elements.length + 1}`, zIndex: elements.length, fill: 'transparent', stroke: '', strokeWidth: 0, borderRadius: 0, shadow: null, imageUrl: url,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
  }, [elements, canvasSize, saveHistory]);

  const handleUpdateElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const handleDeleteElement = useCallback(() => {
    if (!selectedId) return;
    saveHistory();
    setElements(prev => prev.filter(el => el.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, saveHistory]);

  const handleCopy = useCallback(() => {
    if (selectedElement) setClipboard({ ...selectedElement });
  }, [selectedElement]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    saveHistory();
    const pasted = { ...clipboard, id: `el-${Date.now()}`, x: clipboard.x + 20, y: clipboard.y + 20, name: `${clipboard.name} (copy)` };
    setElements(prev => [...prev, pasted]);
    setSelectedId(pasted.id);
  }, [clipboard, saveHistory]);

  const handleAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!selectedElement) return;
    saveHistory();
    let updates: Partial<CanvasElement> = {};
    if (alignment === 'left') updates.x = 0;
    else if (alignment === 'center') updates.x = (canvasSize.width - selectedElement.width) / 2;
    else if (alignment === 'right') updates.x = canvasSize.width - selectedElement.width;
    else if (alignment === 'top') updates.y = 0;
    else if (alignment === 'middle') updates.y = (canvasSize.height - selectedElement.height) / 2;
    else if (alignment === 'bottom') updates.y = canvasSize.height - selectedElement.height;
    handleUpdateElement(selectedElement.id, updates);
  }, [selectedElement, canvasSize, saveHistory, handleUpdateElement]);

  const handleMoveLayer = useCallback((direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (!selectedElement) return;
    saveHistory();
    setElements(prev => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex(e => e.id === selectedElement.id);
      if (direction === 'up' && idx < sorted.length - 1) {
        const temp = sorted[idx].zIndex;
        sorted[idx].zIndex = sorted[idx + 1].zIndex;
        sorted[idx + 1].zIndex = temp;
      } else if (direction === 'down' && idx > 0) {
        const temp = sorted[idx].zIndex;
        sorted[idx].zIndex = sorted[idx - 1].zIndex;
        sorted[idx - 1].zIndex = temp;
      } else if (direction === 'top') {
        sorted[idx].zIndex = Math.max(...sorted.map(e => e.zIndex)) + 1;
      } else if (direction === 'bottom') {
        sorted[idx].zIndex = Math.min(...sorted.map(e => e.zIndex)) - 1;
      }
      return sorted;
    });
  }, [selectedElement, saveHistory]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) setSelectedId(null);
  }, []);

  if (loading) {
    return (<div className="canvas-loading"><div className="loading-spinner" /><p>Loading canvas...</p></div>);
  }

  if (error) {
    return (<div className="canvas-error"><h3>Error</h3><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></div>);
  }

  return (
    <div className="canvas-editor">
      <div className="canvas-toolbar">
        <div className="tool-group">
          {(['select', 'text', 'shape', 'draw', 'pan'] as ToolMode[]).map(tool => (
            <button key={tool} className={`tool-btn ${toolMode === tool ? 'active' : ''}`} onClick={() => setToolMode(tool)}>{tool.charAt(0).toUpperCase() + tool.slice(1)}</button>
          ))}
        </div>
        <div className="tool-group">
          <button onClick={handleUndo} disabled={historyIndex <= 0}>Undo</button>
          <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
        </div>
        <div className="tool-group">
          <button onClick={() => setShowGrid(!showGrid)}>{showGrid ? 'Hide' : 'Show'} Grid</button>
          <button onClick={() => setShowRulers(!showRulers)}>{showRulers ? 'Hide' : 'Show'} Rulers</button>
          <label><input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /> Snap</label>
        </div>
        <div className="zoom-control">
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
          <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}>Fit</button>
        </div>
        <button className="size-preset-btn" onClick={() => setShowSizePresets(!showSizePresets)}>
          {canvasSize.width}x{canvasSize.height}
        </button>
        {showSizePresets && (
          <div className="size-presets-dropdown">
            {SIZE_PRESETS.map(preset => (
              <button key={preset.name} className="preset-option" onClick={() => { setCanvasSize(preset); setShowSizePresets(false); }}>
                <span className="preset-name">{preset.name}</span>
                <span className="preset-dims">{preset.width}x{preset.height}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="canvas-main">
        {showLeftPanel && (
          <div className="left-panel">
            <div className="panel-tabs">
              {(['elements', 'text', 'shapes', 'uploads', 'backgrounds'] as const).map(tab => (
                <button key={tab} className={`panel-tab ${leftPanelTab === tab ? 'active' : ''}`} onClick={() => setLeftPanelTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
              ))}
            </div>
            <div className="panel-content">
              {leftPanelTab === 'text' && (
                <div className="text-panel">
                  <button className="add-heading" onClick={handleAddText}>Add Heading</button>
                  <button className="add-subheading" onClick={handleAddText}>Add Subheading</button>
                  <button className="add-body" onClick={handleAddText}>Add Body Text</button>
                  <div className="font-pairs">
                    <h4>Font Combinations</h4>
                    {['Inter + Roboto', 'Playfair + Lato', 'Montserrat + Open Sans'].map(pair => (
                      <button key={pair} className="font-pair-btn">{pair}</button>
                    ))}
                  </div>
                </div>
              )}
              {leftPanelTab === 'shapes' && (
                <div className="shapes-panel">
                  <h4>Basic Shapes</h4>
                  <div className="shapes-grid">
                    {SHAPE_OPTIONS.map(shape => (
                      <button key={shape} className="shape-btn" onClick={() => handleAddShape(shape)}>{shape}</button>
                    ))}
                  </div>
                </div>
              )}
              {leftPanelTab === 'uploads' && (
                <div className="uploads-panel">
                  <button className="upload-btn" onClick={() => handleAddImage('/placeholder.jpg')}>Upload Image</button>
                  <div className="recent-uploads">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="upload-thumb" onClick={() => handleAddImage(`/uploads/${i}.jpg`)}>
                        <img src={`/uploads/${i}.jpg`} alt={`Upload ${i}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {leftPanelTab === 'backgrounds' && (
                <div className="backgrounds-panel">
                  <h4>Solid Colors</h4>
                  <div className="color-grid">
                    {['#ffffff', '#000000', '#f3f4f6', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(color => (
                      <button key={color} className="color-swatch" style={{ backgroundColor: color }} onClick={() => setBackgroundColor(color)} />
                    ))}
                  </div>
                  <div className="custom-color">
                    <label>Custom</label>
                    <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
                  </div>
                </div>
              )}
              {leftPanelTab === 'elements' && (
                <div className="elements-panel">
                  <h4>Layers ({elements.length})</h4>
                  <div className="layers-list">
                    {[...elements].sort((a, b) => b.zIndex - a.zIndex).map(el => (
                      <div key={el.id} className={`layer-item ${selectedId === el.id ? 'selected' : ''}`} onClick={() => setSelectedId(el.id)}>
                        <button className="visibility-btn" onClick={(e) => { e.stopPropagation(); handleUpdateElement(el.id, { visible: !el.visible }); }}>{el.visible ? '👁' : '◌'}</button>
                        <span className="layer-name">{el.name}</span>
                        <button className="lock-btn" onClick={(e) => { e.stopPropagation(); handleUpdateElement(el.id, { locked: !el.locked }); }}>{el.locked ? '🔒' : '🔓'}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="canvas-area" ref={canvasRef} onClick={handleCanvasClick}>
          {showRulers && (
            <>
              <div className="ruler ruler-horizontal">{Array.from({ length: Math.ceil(canvasSize.width / 100) }, (_, i) => (<span key={i} className="ruler-mark">{i * 100}</span>))}</div>
              <div className="ruler ruler-vertical">{Array.from({ length: Math.ceil(canvasSize.height / 100) }, (_, i) => (<span key={i} className="ruler-mark">{i * 100}</span>))}</div>
            </>
          )}
          <div className="canvas-viewport" style={{ transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)` }}>
            <div className="canvas-surface" style={{ width: canvasSize.width, height: canvasSize.height, backgroundColor }}>
              {showGrid && (
                <div className="canvas-grid" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }} />
              )}
              {showAlignGuides && (
                <>
                  {alignGuides.x.map((x, i) => (<div key={`gx-${i}`} className="align-guide-v" style={{ left: x }} />))}
                  {alignGuides.y.map((y, i) => (<div key={`gy-${i}`} className="align-guide-h" style={{ top: y }} />))}
                </>
              )}
              {elements.filter(el => el.visible).sort((a, b) => a.zIndex - b.zIndex).map(el => (
                <div
                  key={el.id}
                  className={`canvas-element ${selectedId === el.id ? 'selected' : ''} ${el.locked ? 'locked' : ''}`}
                  style={{ left: el.x, top: el.y, width: el.width, height: el.height, transform: `rotate(${el.rotation}deg)`, opacity: el.opacity, zIndex: el.zIndex }}
                  onClick={(e) => { e.stopPropagation(); if (!el.locked) setSelectedId(el.id); }}
                >
                  {el.type === 'shape' && (<div className="shape-render" style={{ backgroundColor: el.fill, borderRadius: el.borderRadius, border: el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : 'none', width: '100%', height: '100%' }} />)}
                  {el.type === 'text' && el.text && (<div className="text-render" style={{ fontSize: el.text.fontSize, fontFamily: el.text.fontFamily, fontWeight: el.text.fontWeight, textAlign: el.text.textAlign as any, color: el.text.color, lineHeight: el.text.lineHeight }}>{el.text.content}</div>)}
                  {el.type === 'image' && (<img src={el.imageUrl} alt={el.name} className="image-render" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: el.borderRadius }} />)}
                  {selectedId === el.id && !el.locked && (
                    <div className="selection-handles">
                      <div className="handle handle-tl" /><div className="handle handle-tr" /><div className="handle handle-bl" /><div className="handle handle-br" />
                      <div className="handle handle-t" /><div className="handle handle-b" /><div className="handle handle-l" /><div className="handle handle-r" />
                      <div className="rotation-handle" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedElement && (
          <div className="properties-panel">
            <h3>Properties</h3>
            <div className="prop-section">
              <h4>Transform</h4>
              <div className="prop-row"><label>X</label><input type="number" value={Math.round(selectedElement.x)} onChange={(e) => handleUpdateElement(selectedElement.id, { x: parseInt(e.target.value) })} /></div>
              <div className="prop-row"><label>Y</label><input type="number" value={Math.round(selectedElement.y)} onChange={(e) => handleUpdateElement(selectedElement.id, { y: parseInt(e.target.value) })} /></div>
              <div className="prop-row"><label>W</label><input type="number" value={Math.round(selectedElement.width)} onChange={(e) => handleUpdateElement(selectedElement.id, { width: parseInt(e.target.value) })} /></div>
              <div className="prop-row"><label>H</label><input type="number" value={Math.round(selectedElement.height)} onChange={(e) => handleUpdateElement(selectedElement.id, { height: parseInt(e.target.value) })} /></div>
              <div className="prop-row"><label>Rotation</label><input type="range" min={0} max={360} value={selectedElement.rotation} onChange={(e) => handleUpdateElement(selectedElement.id, { rotation: parseInt(e.target.value) })} /><span>{selectedElement.rotation}deg</span></div>
              <div className="prop-row"><label>Opacity</label><input type="range" min={0} max={1} step={0.01} value={selectedElement.opacity} onChange={(e) => handleUpdateElement(selectedElement.id, { opacity: parseFloat(e.target.value) })} /><span>{Math.round(selectedElement.opacity * 100)}%</span></div>
            </div>
            <div className="prop-section">
              <h4>Alignment</h4>
              <div className="align-buttons">
                <button onClick={() => handleAlign('left')}>Left</button>
                <button onClick={() => handleAlign('center')}>Center</button>
                <button onClick={() => handleAlign('right')}>Right</button>
                <button onClick={() => handleAlign('top')}>Top</button>
                <button onClick={() => handleAlign('middle')}>Middle</button>
                <button onClick={() => handleAlign('bottom')}>Bottom</button>
              </div>
            </div>
            <div className="prop-section">
              <h4>Layer</h4>
              <div className="layer-buttons">
                <button onClick={() => handleMoveLayer('top')}>Front</button>
                <button onClick={() => handleMoveLayer('up')}>Up</button>
                <button onClick={() => handleMoveLayer('down')}>Down</button>
                <button onClick={() => handleMoveLayer('bottom')}>Back</button>
              </div>
            </div>
            <div className="prop-section">
              <h4>Style</h4>
              <div className="prop-row"><label>Fill</label><input type="color" value={selectedElement.fill || '#000000'} onChange={(e) => handleUpdateElement(selectedElement.id, { fill: e.target.value })} /></div>
              <div className="prop-row"><label>Border</label><input type="color" value={selectedElement.stroke || '#000000'} onChange={(e) => handleUpdateElement(selectedElement.id, { stroke: e.target.value })} /></div>
              <div className="prop-row"><label>Border Width</label><input type="number" min={0} max={20} value={selectedElement.strokeWidth} onChange={(e) => handleUpdateElement(selectedElement.id, { strokeWidth: parseInt(e.target.value) })} /></div>
              <div className="prop-row"><label>Radius</label><input type="range" min={0} max={100} value={selectedElement.borderRadius} onChange={(e) => handleUpdateElement(selectedElement.id, { borderRadius: parseInt(e.target.value) })} /></div>
            </div>
            {selectedElement.type === 'text' && selectedElement.text && (
              <div className="prop-section">
                <h4>Text</h4>
                <textarea value={selectedElement.text.content} onChange={(e) => handleUpdateElement(selectedElement.id, { text: { ...selectedElement.text!, content: e.target.value } })} />
                <div className="prop-row"><label>Size</label><input type="number" value={selectedElement.text.fontSize} onChange={(e) => handleUpdateElement(selectedElement.id, { text: { ...selectedElement.text!, fontSize: parseInt(e.target.value) } })} /></div>
                <div className="prop-row"><label>Color</label><input type="color" value={selectedElement.text.color} onChange={(e) => handleUpdateElement(selectedElement.id, { text: { ...selectedElement.text!, color: e.target.value } })} /></div>
                <div className="prop-row"><label>Align</label>
                  <select value={selectedElement.text.textAlign} onChange={(e) => handleUpdateElement(selectedElement.id, { text: { ...selectedElement.text!, textAlign: e.target.value } })}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                </div>
                <div className="prop-row"><label>Weight</label>
                  <select value={selectedElement.text.fontWeight} onChange={(e) => handleUpdateElement(selectedElement.id, { text: { ...selectedElement.text!, fontWeight: e.target.value } })}>
                    <option value="normal">Normal</option><option value="bold">Bold</option><option value="light">Light</option>
                  </select>
                </div>
              </div>
            )}
            <div className="prop-actions">
              <button onClick={handleCopy}>Copy</button>
              <button onClick={handlePaste} disabled={!clipboard}>Paste</button>
              <button className="delete-btn" onClick={handleDeleteElement}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasEditor;
