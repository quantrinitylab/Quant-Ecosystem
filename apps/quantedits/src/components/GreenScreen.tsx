// ============================================================================
// QuantEdits - Green Screen (Chroma Key) Component
// Color picker, tolerance, edge softness, spill suppression, preview
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';

interface ChromaKeySettings {
  enabled: boolean;
  keyColor: string;
  tolerance: number;
  edgeSoftness: number;
  spillSuppression: boolean;
  spillAmount: number;
  defringe: number;
  shadowOpacity: number;
  highlightOpacity: number;
}

interface GreenScreenProps {
  clipId: string;
  settings: ChromaKeySettings;
  onUpdateSettings: (settings: ChromaKeySettings) => void;
  previewUrl: string;
}

const DEFAULT_SETTINGS: ChromaKeySettings = {
  enabled: false,
  keyColor: '#00ff00',
  tolerance: 40,
  edgeSoftness: 5,
  spillSuppression: true,
  spillAmount: 50,
  defringe: 2,
  shadowOpacity: 50,
  highlightOpacity: 50,
};

const PRESET_COLORS = [
  { name: 'Green', color: '#00ff00' },
  { name: 'Blue', color: '#0000ff' },
  { name: 'Red', color: '#ff0000' },
  { name: 'Magenta', color: '#ff00ff' },
  { name: 'Cyan', color: '#00ffff' },
  { name: 'Yellow', color: '#ffff00' },
];

const GreenScreen: React.FC<GreenScreenProps> = ({ clipId, settings, onUpdateSettings, previewUrl }) => {
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState<'result' | 'matte' | 'original'>('result');
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleToggleEnabled = useCallback(() => {
    onUpdateSettings({ ...settings, enabled: !settings.enabled });
  }, [settings, onUpdateSettings]);

  const handleColorChange = useCallback((color: string) => {
    onUpdateSettings({ ...settings, keyColor: color });
  }, [settings, onUpdateSettings]);

  const handleToleranceChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, tolerance: value });
  }, [settings, onUpdateSettings]);

  const handleEdgeSoftnessChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, edgeSoftness: value });
  }, [settings, onUpdateSettings]);

  const handleSpillToggle = useCallback(() => {
    onUpdateSettings({ ...settings, spillSuppression: !settings.spillSuppression });
  }, [settings, onUpdateSettings]);

  const handleSpillAmountChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, spillAmount: value });
  }, [settings, onUpdateSettings]);

  const handleDefringeChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, defringe: value });
  }, [settings, onUpdateSettings]);

  const handleShadowOpacityChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, shadowOpacity: value });
  }, [settings, onUpdateSettings]);

  const handleHighlightOpacityChange = useCallback((value: number) => {
    onUpdateSettings({ ...settings, highlightOpacity: value });
  }, [settings, onUpdateSettings]);

  const handleReset = useCallback(() => {
    onUpdateSettings(DEFAULT_SETTINGS);
  }, [onUpdateSettings]);

  const handlePickColor = useCallback(() => {
    setIsPickingColor(true);
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickingColor || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
      handleColorChange(hex);
    }
    setIsPickingColor(false);
  }, [isPickingColor, handleColorChange]);

  return (
    <div className="green-screen-panel">
      <div className="panel-header">
        <h3>Chroma Key</h3>
        <label className="enable-toggle">
          <input type="checkbox" checked={settings.enabled} onChange={handleToggleEnabled} />
          <span>{settings.enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {settings.enabled && (
        <>
          <div className="preview-section">
            <div className="preview-controls">
              <button className={`preview-mode ${previewMode === 'result' ? 'active' : ''}`} onClick={() => setPreviewMode('result')}>Result</button>
              <button className={`preview-mode ${previewMode === 'matte' ? 'active' : ''}`} onClick={() => setPreviewMode('matte')}>Matte</button>
              <button className={`preview-mode ${previewMode === 'original' ? 'active' : ''}`} onClick={() => setPreviewMode('original')}>Original</button>
            </div>
            {showPreview && (
              <div className={`preview-window mode-${previewMode}`}>
                <canvas ref={canvasRef} className={`preview-canvas ${isPickingColor ? 'picking' : ''}`} onClick={handleCanvasClick} width={320} height={180} />
                <img src={previewUrl} alt="Preview" className="preview-source" />
                {previewMode === 'result' && (
                  <div className="transparency-grid" />
                )}
              </div>
            )}
            <button className="toggle-preview" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>

          <div className="controls-section">
            <div className="control-group">
              <h4>Key Color</h4>
              <div className="color-picker-row">
                <div className="current-color" style={{ backgroundColor: settings.keyColor }}>
                  <span className="color-hex">{settings.keyColor}</span>
                </div>
                <input type="color" value={settings.keyColor} onChange={(e) => handleColorChange(e.target.value)} className="color-input" />
                <button className={`eyedropper-btn ${isPickingColor ? 'active' : ''}`} onClick={handlePickColor} title="Pick color from preview">
                  &#128065;
                </button>
              </div>
              <div className="preset-colors">
                {PRESET_COLORS.map(preset => (
                  <button key={preset.name} className={`preset-swatch ${settings.keyColor === preset.color ? 'active' : ''}`} style={{ backgroundColor: preset.color }} onClick={() => handleColorChange(preset.color)} title={preset.name} />
                ))}
              </div>
            </div>

            <div className="control-group">
              <h4>Tolerance</h4>
              <div className="slider-row">
                <input type="range" min={0} max={100} value={settings.tolerance} onChange={(e) => handleToleranceChange(parseInt(e.target.value))} className="control-slider" />
                <span className="slider-value">{settings.tolerance}</span>
              </div>
              <p className="control-hint">Higher values remove more color variations</p>
            </div>

            <div className="control-group">
              <h4>Edge Softness</h4>
              <div className="slider-row">
                <input type="range" min={0} max={20} value={settings.edgeSoftness} onChange={(e) => handleEdgeSoftnessChange(parseInt(e.target.value))} className="control-slider" />
                <span className="slider-value">{settings.edgeSoftness}</span>
              </div>
              <p className="control-hint">Smooth the edges of the removed area</p>
            </div>

            <div className="control-group">
              <h4>Spill Suppression</h4>
              <label className="spill-toggle">
                <input type="checkbox" checked={settings.spillSuppression} onChange={handleSpillToggle} />
                <span>Remove color spill from edges</span>
              </label>
              {settings.spillSuppression && (
                <div className="slider-row">
                  <input type="range" min={0} max={100} value={settings.spillAmount} onChange={(e) => handleSpillAmountChange(parseInt(e.target.value))} className="control-slider" />
                  <span className="slider-value">{settings.spillAmount}%</span>
                </div>
              )}
            </div>

            {showAdvanced && (
              <>
                <div className="control-group">
                  <h4>Defringe</h4>
                  <div className="slider-row">
                    <input type="range" min={0} max={10} value={settings.defringe} onChange={(e) => handleDefringeChange(parseInt(e.target.value))} className="control-slider" />
                    <span className="slider-value">{settings.defringe}px</span>
                  </div>
                </div>
                <div className="control-group">
                  <h4>Shadow Opacity</h4>
                  <div className="slider-row">
                    <input type="range" min={0} max={100} value={settings.shadowOpacity} onChange={(e) => handleShadowOpacityChange(parseInt(e.target.value))} className="control-slider" />
                    <span className="slider-value">{settings.shadowOpacity}%</span>
                  </div>
                </div>
                <div className="control-group">
                  <h4>Highlight Opacity</h4>
                  <div className="slider-row">
                    <input type="range" min={0} max={100} value={settings.highlightOpacity} onChange={(e) => handleHighlightOpacityChange(parseInt(e.target.value))} className="control-slider" />
                    <span className="slider-value">{settings.highlightOpacity}%</span>
                  </div>
                </div>
              </>
            )}

            <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>

            <button className="reset-btn" onClick={handleReset}>Reset to Default</button>
          </div>
        </>
      )}
    </div>
  );
};

export default GreenScreen;
