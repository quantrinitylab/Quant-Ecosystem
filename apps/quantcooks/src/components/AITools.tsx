// ============================================================================
// QuantEdits - AI Tools Panel Component
// Auto-caption is wired to the real POST /api/ai/captions endpoint. All other
// tools are shown as unavailable: their backend endpoints do not exist, so the
// panel no longer simulates fake processing or invents result URLs.
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
  /** True only when a real backend endpoint backs this tool. */
  available: boolean;
}

interface AIToolResult {
  id: string;
  toolId: string;
  status: 'processing' | 'complete' | 'failed';
  /** Real text output from the API (captions), or null while processing. */
  text: string | null;
  error: string | null;
  startedAt: number;
}

interface AIToolsPanelProps {
  clipId: string | null;
  onApplyResult: (toolId: string, resultUrl: string) => void;
  creditsRemaining: number;
}

const AI_TOOLS: AITool[] = [
  { id: 'auto-caption', name: 'Auto Caption', description: 'Generate captions from a transcript', icon: '💬', category: 'generate', isPremium: false, credits: 1, available: true },
  { id: 'bg-remove', name: 'Background Remove', description: 'Remove background and make transparent', icon: '✂️', category: 'remove', isPremium: false, credits: 2, available: false },
  { id: 'object-remove', name: 'Object Remove', description: 'Paint over objects to remove them', icon: '🎯', category: 'remove', isPremium: true, credits: 3, available: false },
  { id: 'enhance', name: 'Enhance', description: 'Improve quality, fix lighting and colors', icon: '✨', category: 'enhance', isPremium: false, credits: 1, available: false },
  { id: 'upscale-2x', name: 'Upscale 2x', description: 'Double resolution with AI', icon: '🔍', category: 'enhance', isPremium: false, credits: 2, available: false },
  { id: 'upscale-4x', name: 'Upscale 4x', description: 'Quadruple resolution with AI', icon: '🔎', category: 'enhance', isPremium: true, credits: 5, available: false },
  { id: 'style-transfer', name: 'Style Transfer', description: 'Apply artistic styles to video/image', icon: '🎨', category: 'transform', isPremium: true, credits: 4, available: false },
  { id: 'denoise', name: 'Denoise', description: 'Remove grain and noise', icon: '🌫️', category: 'enhance', isPremium: false, credits: 1, available: false },
  { id: 'stabilize', name: 'Stabilize', description: 'Smooth shaky video footage', icon: '📐', category: 'enhance', isPremium: false, credits: 2, available: false },
  { id: 'face-enhance', name: 'Face Enhance', description: 'Smooth skin, enhance facial features', icon: '👤', category: 'enhance', isPremium: true, credits: 3, available: false },
  { id: 'color-match', name: 'Color Match', description: 'Match colors between clips', icon: '🌈', category: 'transform', isPremium: false, credits: 1, available: false },
  { id: 'audio-enhance', name: 'Audio Enhance', description: 'Reduce noise, enhance voice clarity', icon: '🎙️', category: 'enhance', isPremium: false, credits: 1, available: false },
];

interface CaptionsApiResponse {
  success: boolean;
  data?: { captions: string };
  error?: { code: string; message: string };
}

const AIToolsPanel: React.FC<AIToolsPanelProps> = ({ clipId, creditsRemaining }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | AITool['category']>('all');
  const [activeResults, setActiveResults] = useState<AIToolResult[]>([]);
  const [captionTranscript, setCaptionTranscript] = useState('');
  const [captionStyle, setCaptionStyle] = useState<'concise' | 'detailed' | 'funny'>('concise');
  const [showCaptionForm, setShowCaptionForm] = useState(false);
  const [runningCaption, setRunningCaption] = useState(false);

  const filteredTools = AI_TOOLS.filter(
    (t) => activeCategory === 'all' || t.category === activeCategory,
  );

  const handleRunTool = useCallback(
    (tool: AITool) => {
      if (!clipId || !tool.available) return;
      if (tool.credits > creditsRemaining) return;
      if (tool.id === 'auto-caption') {
        setShowCaptionForm(true);
        return;
      }
    },
    [clipId, creditsRemaining],
  );

  const handleRunAutoCaption = useCallback(async () => {
    const transcript = captionTranscript.trim();
    if (!transcript || runningCaption) return;
    setRunningCaption(true);
    const result: AIToolResult = {
      id: `result-${Date.now()}`,
      toolId: 'auto-caption',
      status: 'processing',
      text: null,
      error: null,
      startedAt: Date.now(),
    };
    setActiveResults((prev) => [...prev, result]);
    setShowCaptionForm(false);
    try {
      const res = await fetch('/api/ai/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, style: captionStyle }),
      });
      const payload = (await res.json().catch(() => null)) as CaptionsApiResponse | null;
      if (!res.ok || !payload?.success || !payload.data?.captions) {
        throw new Error(
          payload?.error?.message || `Caption request failed (HTTP ${res.status})`,
        );
      }
      setActiveResults((prev) =>
        prev.map((r) =>
          r.id === result.id ? { ...r, status: 'complete', text: payload.data!.captions } : r,
        ),
      );
    } catch (err) {
      setActiveResults((prev) =>
        prev.map((r) =>
          r.id === result.id
            ? {
                ...r,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Caption request failed',
              }
            : r,
        ),
      );
    } finally {
      setRunningCaption(false);
    }
  }, [captionTranscript, captionStyle, runningCaption]);

  const handleCancelResult = useCallback((resultId: string) => {
    setActiveResults((prev) => prev.filter((r) => r.id !== resultId));
  }, []);

  if (!clipId) {
    return (
      <div className="ai-tools-panel empty">
        <div className="empty-icon">🤖</div>
        <p>Select a clip to use AI tools</p>
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
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            className={`ai-tool-card ${tool.isPremium ? 'premium' : ''} ${tool.available ? '' : 'unavailable'}`}
            onClick={() => handleRunTool(tool)}
            disabled={!tool.available || tool.credits > creditsRemaining}
            title={tool.available ? tool.description : 'Not available yet — no backend for this tool'}
          >
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-name">{tool.name}</span>
            <span className="tool-desc">
              {tool.available ? tool.description : 'Not available yet'}
            </span>
            <span className="tool-cost">{tool.credits} credits</span>
            {tool.isPremium && <span className="pro-badge">PRO</span>}
          </button>
        ))}
      </div>

      {showCaptionForm && (
        <div className="caption-form">
          <h4>Auto Caption</h4>
          <p>Paste the clip transcript — captions are generated by the AI service.</p>
          <textarea
            value={captionTranscript}
            onChange={(e) => setCaptionTranscript(e.target.value)}
            placeholder="Paste transcript here..."
            rows={4}
          />
          <div className="caption-style-row">
            <label>Style</label>
            <select
              value={captionStyle}
              onChange={(e) => setCaptionStyle(e.target.value as typeof captionStyle)}
            >
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="funny">Funny</option>
            </select>
          </div>
          <div className="caption-form-actions">
            <button onClick={() => setShowCaptionForm(false)}>Cancel</button>
            <button onClick={handleRunAutoCaption} disabled={!captionTranscript.trim() || runningCaption}>
              {runningCaption ? 'Generating…' : 'Generate Captions'}
            </button>
          </div>
        </div>
      )}

      {activeResults.length > 0 && (
        <div className="ai-results">
          <h4>Results</h4>
          {activeResults.map((result) => (
            <div key={result.id} className={`result-item status-${result.status}`}>
              <div className="result-info">
                <span className="result-tool">
                  {AI_TOOLS.find((t) => t.id === result.toolId)?.name}
                </span>
                <span className="result-status">{result.status}</span>
              </div>
              {result.status === 'processing' && (
                <div className="result-progress">
                  <div className="progress-bar indeterminate" />
                  <span>Working…</span>
                </div>
              )}
              {result.status === 'complete' && result.text && (
                <p className="result-text">{result.text}</p>
              )}
              {result.status === 'failed' && <span className="result-error">{result.error}</span>}
              <button className="result-dismiss" onClick={() => handleCancelResult(result.id)}>
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AIToolsPanel;
