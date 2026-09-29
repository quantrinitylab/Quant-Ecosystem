// ============================================================================
// QuantEdits - AI Tools Panel Component
// Auto-caption, background remove, object remove, enhance, upscale, style transfer
// ============================================================================

import React, { useState, useCallback } from 'react';

interface AITool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'enhance' | 'remove' | 'generate' | 'transform';
  isPremium: boolean;
  credits: number;
}

interface AIToolResult {
  id: string;
  toolId: string;
  status: 'processing' | 'complete' | 'failed';
  progress: number;
  resultUrl: string | null;
  error: string | null;
  startedAt: number;
}

interface StyleTransferOption {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
}

interface AIToolsPanelProps {
  clipId: string | null;
  onApplyResult: (toolId: string, resultUrl: string) => void;
  creditsRemaining: number;
}

const AI_TOOLS: AITool[] = [
  { id: 'auto-caption', name: 'Auto Caption', description: 'Generate captions from speech automatically', icon: '💬', category: 'generate', isPremium: false, credits: 1 },
  { id: 'bg-remove', name: 'Background Remove', description: 'Remove background and make transparent', icon: '✂️', category: 'remove', isPremium: false, credits: 2 },
  { id: 'object-remove', name: 'Object Remove', description: 'Paint over objects to remove them', icon: '🎯', category: 'remove', isPremium: true, credits: 3 },
  { id: 'enhance', name: 'Enhance', description: 'Improve quality, fix lighting and colors', icon: '✨', category: 'enhance', isPremium: false, credits: 1 },
  { id: 'upscale-2x', name: 'Upscale 2x', description: 'Double resolution with AI', icon: '🔍', category: 'enhance', isPremium: false, credits: 2 },
  { id: 'upscale-4x', name: 'Upscale 4x', description: 'Quadruple resolution with AI', icon: '🔎', category: 'enhance', isPremium: true, credits: 5 },
  { id: 'style-transfer', name: 'Style Transfer', description: 'Apply artistic styles to video/image', icon: '🎨', category: 'transform', isPremium: true, credits: 4 },
  { id: 'denoise', name: 'Denoise', description: 'Remove grain and noise', icon: '🌫️', category: 'enhance', isPremium: false, credits: 1 },
  { id: 'stabilize', name: 'Stabilize', description: 'Smooth shaky video footage', icon: '📐', category: 'enhance', isPremium: false, credits: 2 },
  { id: 'face-enhance', name: 'Face Enhance', description: 'Smooth skin, enhance facial features', icon: '👤', category: 'enhance', isPremium: true, credits: 3 },
  { id: 'color-match', name: 'Color Match', description: 'Match colors between clips', icon: '🌈', category: 'transform', isPremium: false, credits: 1 },
  { id: 'audio-enhance', name: 'Audio Enhance', description: 'Reduce noise, enhance voice clarity', icon: '🎙️', category: 'enhance', isPremium: false, credits: 1 },
];

const STYLE_OPTIONS: StyleTransferOption[] = [
  { id: 'st-oil', name: 'Oil Painting', thumbnail: '/styles/oil.jpg', category: 'Classic' },
  { id: 'st-watercolor', name: 'Watercolor', thumbnail: '/styles/watercolor.jpg', category: 'Classic' },
  { id: 'st-sketch', name: 'Pencil Sketch', thumbnail: '/styles/sketch.jpg', category: 'Classic' },
  { id: 'st-anime', name: 'Anime', thumbnail: '/styles/anime.jpg', category: 'Modern' },
  { id: 'st-pixel', name: 'Pixel Art', thumbnail: '/styles/pixel.jpg', category: 'Modern' },
  { id: 'st-neon', name: 'Neon Glow', thumbnail: '/styles/neon.jpg', category: 'Modern' },
  { id: 'st-pop-art', name: 'Pop Art', thumbnail: '/styles/pop-art.jpg', category: 'Artistic' },
  { id: 'st-impressionist', name: 'Impressionist', thumbnail: '/styles/impressionist.jpg', category: 'Classic' },
  { id: 'st-cyberpunk', name: 'Cyberpunk', thumbnail: '/styles/cyberpunk.jpg', category: 'Modern' },
];

const AIToolsPanel: React.FC<AIToolsPanelProps> = ({ clipId, onApplyResult, creditsRemaining }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | AITool['category']>('all');
  const [activeResults, setActiveResults] = useState<AIToolResult[]>([]);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [isObjectRemoveMode, setIsObjectRemoveMode] = useState(false);
  const [brushSize, setBrushSize] = useState(20);

  const filteredTools = AI_TOOLS.filter(t => activeCategory === 'all' || t.category === activeCategory);

  const handleRunTool = useCallback((tool: AITool) => {
    if (!clipId) return;
    if (tool.credits > creditsRemaining) return;
    if (tool.id === 'style-transfer') { setShowStylePicker(true); return; }
    if (tool.id === 'object-remove') { setIsObjectRemoveMode(true); return; }

    const result: AIToolResult = { id: `result-${Date.now()}`, toolId: tool.id, status: 'processing', progress: 0, resultUrl: null, error: null, startedAt: Date.now() };
    setActiveResults(prev => [...prev, result]);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20 + 5;
      if (progress >= 100) {
        clearInterval(interval);
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'complete', progress: 100, resultUrl: `/ai-results/${result.id}.png` } : r));
        onApplyResult(tool.id, `/ai-results/${result.id}.png`);
      } else {
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, progress: Math.min(99, progress) } : r));
      }
    }, 500);
  }, [clipId, creditsRemaining, onApplyResult]);

  const handleApplyStyle = useCallback((styleId: string) => {
    setSelectedStyle(styleId);
    setShowStylePicker(false);
    const result: AIToolResult = { id: `result-${Date.now()}`, toolId: 'style-transfer', status: 'processing', progress: 0, resultUrl: null, error: null, startedAt: Date.now() };
    setActiveResults(prev => [...prev, result]);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10 + 3;
      if (progress >= 100) {
        clearInterval(interval);
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'complete', progress: 100, resultUrl: `/ai-results/${result.id}-styled.png` } : r));
        onApplyResult('style-transfer', `/ai-results/${result.id}-styled.png`);
      } else {
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, progress: Math.min(99, progress) } : r));
      }
    }, 700);
  }, [onApplyResult]);

  const handleObjectRemoveApply = useCallback(() => {
    setIsObjectRemoveMode(false);
    const result: AIToolResult = { id: `result-${Date.now()}`, toolId: 'object-remove', status: 'processing', progress: 0, resultUrl: null, error: null, startedAt: Date.now() };
    setActiveResults(prev => [...prev, result]);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        clearInterval(interval);
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'complete', progress: 100, resultUrl: `/ai-results/${result.id}-removed.png` } : r));
        onApplyResult('object-remove', `/ai-results/${result.id}-removed.png`);
      } else {
        setActiveResults(prev => prev.map(r => r.id === result.id ? { ...r, progress: Math.min(99, progress) } : r));
      }
    }, 600);
  }, [onApplyResult]);

  const handleCancelResult = useCallback((resultId: string) => {
    setActiveResults(prev => prev.filter(r => r.id !== resultId));
  }, []);

  if (!clipId) {
    return (
      <div className="ai-tools-panel empty">
        <div className="empty-icon">🤖</div>
        <p>Select a clip to use AI tools</p>
      </div>
    );
  }

  if (isObjectRemoveMode) {
    return (
      <div className="ai-tools-panel object-remove-mode">
        <div className="remove-header">
          <h3>Object Remove</h3>
          <p>Paint over the object you want to remove</p>
        </div>
        <div className="remove-canvas">
          <div className="canvas-placeholder">Paint area (brush tool active)</div>
        </div>
        <div className="brush-controls">
          <label>Brush Size</label>
          <input type="range" min={5} max={100} value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} />
          <span>{brushSize}px</span>
        </div>
        <div className="remove-actions">
          <button className="cancel-btn" onClick={() => setIsObjectRemoveMode(false)}>Cancel</button>
          <button className="apply-btn" onClick={handleObjectRemoveApply}>Remove Object</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-tools-panel">
      <div className="ai-header">
        <h3>AI Tools</h3>
        <div className="credits-display">
          <span className="credits-icon">⚡</span>
          <span className="credits-count">{creditsRemaining} credits</span>
        </div>
      </div>

      <div className="ai-categories">
        <button className={`cat-btn ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>All</button>
        <button className={`cat-btn ${activeCategory === 'enhance' ? 'active' : ''}`} onClick={() => setActiveCategory('enhance')}>Enhance</button>
        <button className={`cat-btn ${activeCategory === 'remove' ? 'active' : ''}`} onClick={() => setActiveCategory('remove')}>Remove</button>
        <button className={`cat-btn ${activeCategory === 'generate' ? 'active' : ''}`} onClick={() => setActiveCategory('generate')}>Generate</button>
        <button className={`cat-btn ${activeCategory === 'transform' ? 'active' : ''}`} onClick={() => setActiveCategory('transform')}>Transform</button>
      </div>

      <div className="ai-tools-grid">
        {filteredTools.map(tool => (
          <button key={tool.id} className={`ai-tool-card ${tool.isPremium ? 'premium' : ''}`} onClick={() => handleRunTool(tool)} disabled={tool.credits > creditsRemaining}>
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-name">{tool.name}</span>
            <span className="tool-desc">{tool.description}</span>
            <span className="tool-cost">{tool.credits} credits</span>
            {tool.isPremium && <span className="pro-badge">PRO</span>}
          </button>
        ))}
      </div>

      {activeResults.length > 0 && (
        <div className="ai-results">
          <h4>Processing</h4>
          {activeResults.map(result => (
            <div key={result.id} className={`result-item status-${result.status}`}>
              <div className="result-info">
                <span className="result-tool">{AI_TOOLS.find(t => t.id === result.toolId)?.name}</span>
                <span className="result-status">{result.status}</span>
              </div>
              {result.status === 'processing' && (
                <div className="result-progress">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${result.progress}%` }} /></div>
                  <span>{Math.round(result.progress)}%</span>
                </div>
              )}
              {result.status === 'complete' && <span className="result-done">Applied</span>}
              {result.status === 'failed' && <span className="result-error">{result.error}</span>}
              <button className="result-dismiss" onClick={() => handleCancelResult(result.id)}>x</button>
            </div>
          ))}
        </div>
      )}

      {showStylePicker && (
        <div className="style-picker-overlay">
          <div className="style-picker">
            <h3>Choose Style</h3>
            <div className="style-grid">
              {STYLE_OPTIONS.map(style => (
                <button key={style.id} className={`style-option ${selectedStyle === style.id ? 'selected' : ''}`} onClick={() => handleApplyStyle(style.id)}>
                  <img src={style.thumbnail} alt={style.name} />
                  <span>{style.name}</span>
                </button>
              ))}
            </div>
            <button className="close-style-picker" onClick={() => setShowStylePicker(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIToolsPanel;
