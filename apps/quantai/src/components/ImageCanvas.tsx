// ============================================================================
// QuantAI - ImageCanvas Component
// Image generation preview with regenerate, variations, inpaint mask
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ImageCanvasProps {
  imageUrl?: string;
  width: number;
  height: number;
  prompt: string;
  onRegenerate: () => void;
  onVariations: () => void;
  onInpaint: (mask: Array<{ x: number; y: number; radius: number }>) => void;
  onUpscale: (factor: number) => void;
  isLoading?: boolean;
}

interface MaskPoint {
  x: number;
  y: number;
  radius: number;
}

export default function ImageCanvas({
  imageUrl,
  width,
  height,
  prompt,
  onRegenerate,
  onVariations,
  onInpaint,
  onUpscale,
  isLoading = false,
}: ImageCanvasProps): JSX.Element {
  const [mode, setMode] = useState<'view' | 'mask'>('view');
  const [maskPoints, setMaskPoints] = useState<MaskPoint[]>([]);
  const [brushSize, setBrushSize] = useState<number>(20);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'mask' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      maskPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [maskPoints, mode, width, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'mask') return;
    setIsDrawing(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    setMaskPoints(prev => [...prev, { x, y, radius: brushSize }]);
  }, [mode, brushSize, zoomLevel]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== 'mask') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    setMaskPoints(prev => [...prev, { x, y, radius: brushSize }]);
  }, [isDrawing, mode, brushSize, zoomLevel]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleClearMask = useCallback(() => {
    setMaskPoints([]);
  }, []);

  const handleApplyInpaint = useCallback(() => {
    onInpaint(maskPoints);
    setMaskPoints([]);
    setMode('view');
  }, [maskPoints, onInpaint]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  return (
    <div className="image-canvas-component">
      <div className="canvas-toolbar">
        <div className="toolbar-left">
          <button
            className={`tool-btn ${mode === 'view' ? 'active' : ''}`}
            onClick={() => setMode('view')}
          >
            👁️ View
          </button>
          <button
            className={`tool-btn ${mode === 'mask' ? 'active' : ''}`}
            onClick={() => setMode('mask')}
          >
            ✏️ Mask
          </button>
        </div>
        <div className="toolbar-center">
          <button className="zoom-btn" onClick={handleZoomOut}>-</button>
          <span className="zoom-label">{Math.round(zoomLevel * 100)}%</span>
          <button className="zoom-btn" onClick={handleZoomIn}>+</button>
        </div>
        <div className="toolbar-right">
          <button
            className="controls-toggle"
            onClick={() => setShowControls(!showControls)}
          >
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>
        </div>
      </div>

      <div className="canvas-area" ref={containerRef}>
        <div
          className="canvas-content"
          style={{ transform: `scale(${zoomLevel})`, width, height }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={prompt} className="canvas-image" style={{ width, height }} />
          ) : (
            <div className="canvas-placeholder" style={{ width, height }}>
              <span className="placeholder-icon">🖼️</span>
              <p className="placeholder-text">{isLoading ? 'Generating...' : 'No image generated yet'}</p>
            </div>
          )}

          {mode === 'mask' && (
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className="mask-layer"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          )}

          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>Generating...</span>
            </div>
          )}
        </div>
      </div>

      {mode === 'mask' && (
        <div className="mask-controls">
          <div className="brush-size-control">
            <label>Brush Size: {brushSize}px</label>
            <input
              type="range"
              min="5"
              max="100"
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
            />
          </div>
          <div className="mask-actions">
            <button className="btn-clear-mask" onClick={handleClearMask}>
              Clear Mask
            </button>
            <button
              className="btn-apply-inpaint"
              onClick={handleApplyInpaint}
              disabled={maskPoints.length === 0}
            >
              Apply Inpaint ({maskPoints.length} points)
            </button>
          </div>
        </div>
      )}

      {showControls && (
        <div className="canvas-controls">
          <div className="prompt-display">
            <strong>Prompt:</strong> {prompt}
          </div>
          <div className="action-buttons">
            <button className="btn-regenerate" onClick={onRegenerate} disabled={isLoading}>
              🔄 Regenerate
            </button>
            <button className="btn-variations" onClick={onVariations} disabled={isLoading}>
              🎲 Variations
            </button>
            <div className="upscale-group">
              <button className="btn-upscale" onClick={() => onUpscale(2)} disabled={isLoading}>
                2x Upscale
              </button>
              <button className="btn-upscale" onClick={() => onUpscale(4)} disabled={isLoading}>
                4x Upscale
              </button>
            </div>
          </div>
          <div className="image-info">
            <span>{width} x {height}</span>
            <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
