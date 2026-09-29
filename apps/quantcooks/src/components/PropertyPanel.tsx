// ============================================================================
// QuantEdits - Property Panel Component
// Position, size, rotation, opacity, blend mode, filters, animations
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface ClipProperties {
  id: string;
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
  filters: FilterSettings;
  animation: AnimationPreset | null;
  locked: boolean;
}

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  sharpen: number;
  temperature: number;
  tint: number;
  vignette: number;
  grain: number;
}

type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'soft-light' | 'hard-light' | 'difference' | 'exclusion';

interface AnimationPreset {
  id: string;
  name: string;
  type: 'entrance' | 'exit' | 'emphasis';
  duration: number;
  delay: number;
  easing: string;
}

interface PropertyPanelProps {
  clip: ClipProperties | null;
  onUpdate: (id: string, updates: Partial<ClipProperties>) => void;
  onClose: () => void;
}

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'];

const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: 'fade-in', name: 'Fade In', type: 'entrance', duration: 0.5, delay: 0, easing: 'ease-out' },
  { id: 'slide-left', name: 'Slide Left', type: 'entrance', duration: 0.5, delay: 0, easing: 'ease-out' },
  { id: 'slide-right', name: 'Slide Right', type: 'entrance', duration: 0.5, delay: 0, easing: 'ease-out' },
  { id: 'slide-up', name: 'Slide Up', type: 'entrance', duration: 0.5, delay: 0, easing: 'ease-out' },
  { id: 'zoom-in', name: 'Zoom In', type: 'entrance', duration: 0.5, delay: 0, easing: 'ease-out' },
  { id: 'bounce', name: 'Bounce', type: 'emphasis', duration: 0.8, delay: 0, easing: 'bounce' },
  { id: 'pulse', name: 'Pulse', type: 'emphasis', duration: 0.6, delay: 0, easing: 'ease-in-out' },
  { id: 'shake', name: 'Shake', type: 'emphasis', duration: 0.5, delay: 0, easing: 'ease-in-out' },
  { id: 'fade-out', name: 'Fade Out', type: 'exit', duration: 0.5, delay: 0, easing: 'ease-in' },
  { id: 'zoom-out', name: 'Zoom Out', type: 'exit', duration: 0.5, delay: 0, easing: 'ease-in' },
  { id: 'slide-out-right', name: 'Slide Out Right', type: 'exit', duration: 0.5, delay: 0, easing: 'ease-in' },
];

const PropertyPanel: React.FC<PropertyPanelProps> = ({ clip, onUpdate, onClose }) => {
  const [activeSection, setActiveSection] = useState<'transform' | 'filters' | 'animation'>('transform');
  const [showAllFilters, setShowAllFilters] = useState(false);

  const handlePositionChange = useCallback((axis: 'x' | 'y', value: number) => {
    if (!clip) return;
    onUpdate(clip.id, { position: { ...clip.position, [axis]: value } });
  }, [clip, onUpdate]);

  const handleSizeChange = useCallback((dim: 'width' | 'height', value: number) => {
    if (!clip) return;
    onUpdate(clip.id, { size: { ...clip.size, [dim]: value } });
  }, [clip, onUpdate]);

  const handleFilterChange = useCallback((filter: keyof FilterSettings, value: number) => {
    if (!clip) return;
    onUpdate(clip.id, { filters: { ...clip.filters, [filter]: value } });
  }, [clip, onUpdate]);

  const handleResetFilters = useCallback(() => {
    if (!clip) return;
    onUpdate(clip.id, { filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, sharpen: 0, temperature: 0, tint: 0, vignette: 0, grain: 0 } });
  }, [clip, onUpdate]);

  const handleApplyAnimation = useCallback((preset: AnimationPreset) => {
    if (!clip) return;
    onUpdate(clip.id, { animation: preset });
  }, [clip, onUpdate]);

  const handleRemoveAnimation = useCallback(() => {
    if (!clip) return;
    onUpdate(clip.id, { animation: null });
  }, [clip, onUpdate]);

  const filterGroups = useMemo(() => ({
    basic: [
      { key: 'brightness' as keyof FilterSettings, label: 'Brightness', min: -100, max: 100 },
      { key: 'contrast' as keyof FilterSettings, label: 'Contrast', min: -100, max: 100 },
      { key: 'saturation' as keyof FilterSettings, label: 'Saturation', min: -100, max: 100 },
    ],
    advanced: [
      { key: 'blur' as keyof FilterSettings, label: 'Blur', min: 0, max: 20 },
      { key: 'sharpen' as keyof FilterSettings, label: 'Sharpen', min: 0, max: 100 },
      { key: 'temperature' as keyof FilterSettings, label: 'Temperature', min: -100, max: 100 },
      { key: 'tint' as keyof FilterSettings, label: 'Tint', min: -100, max: 100 },
      { key: 'vignette' as keyof FilterSettings, label: 'Vignette', min: 0, max: 100 },
      { key: 'grain' as keyof FilterSettings, label: 'Grain', min: 0, max: 100 },
    ],
  }), []);

  if (!clip) {
    return (
      <div className="property-panel empty">
        <p className="no-selection">Select a clip to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="property-panel">
      <div className="panel-header">
        <h3>{clip.name}</h3>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      <div className="section-tabs">
        <button className={activeSection === 'transform' ? 'active' : ''} onClick={() => setActiveSection('transform')}>Transform</button>
        <button className={activeSection === 'filters' ? 'active' : ''} onClick={() => setActiveSection('filters')}>Filters</button>
        <button className={activeSection === 'animation' ? 'active' : ''} onClick={() => setActiveSection('animation')}>Animation</button>
      </div>

      {activeSection === 'transform' && (
        <div className="transform-section">
          <div className="prop-group">
            <h4>Position</h4>
            <div className="prop-row">
              <label>X</label>
              <input type="number" value={Math.round(clip.position.x)} onChange={(e) => handlePositionChange('x', parseInt(e.target.value) || 0)} />
            </div>
            <div className="prop-row">
              <label>Y</label>
              <input type="number" value={Math.round(clip.position.y)} onChange={(e) => handlePositionChange('y', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="prop-group">
            <h4>Size</h4>
            <div className="prop-row">
              <label>W</label>
              <input type="number" value={Math.round(clip.size.width)} onChange={(e) => handleSizeChange('width', parseInt(e.target.value) || 0)} />
            </div>
            <div className="prop-row">
              <label>H</label>
              <input type="number" value={Math.round(clip.size.height)} onChange={(e) => handleSizeChange('height', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="prop-group">
            <h4>Rotation</h4>
            <div className="prop-row">
              <input type="range" min={0} max={360} value={clip.rotation} onChange={(e) => onUpdate(clip.id, { rotation: parseInt(e.target.value) })} />
              <span className="value-display">{clip.rotation}deg</span>
            </div>
          </div>
          <div className="prop-group">
            <h4>Opacity</h4>
            <div className="prop-row">
              <input type="range" min={0} max={1} step={0.01} value={clip.opacity} onChange={(e) => onUpdate(clip.id, { opacity: parseFloat(e.target.value) })} />
              <span className="value-display">{Math.round(clip.opacity * 100)}%</span>
            </div>
          </div>
          <div className="prop-group">
            <h4>Blend Mode</h4>
            <select value={clip.blendMode} onChange={(e) => onUpdate(clip.id, { blendMode: e.target.value as BlendMode })} className="blend-mode-select">
              {BLEND_MODES.map(mode => (<option key={mode} value={mode}>{mode.replace('-', ' ')}</option>))}
            </select>
          </div>
        </div>
      )}

      {activeSection === 'filters' && (
        <div className="filters-section">
          <div className="filters-header">
            <h4>Adjustments</h4>
            <button className="reset-filters-btn" onClick={handleResetFilters}>Reset All</button>
          </div>
          {filterGroups.basic.map(f => (
            <div key={f.key} className="filter-row">
              <label>{f.label}</label>
              <input type="range" min={f.min} max={f.max} value={clip.filters[f.key]} onChange={(e) => handleFilterChange(f.key, parseInt(e.target.value))} />
              <span className="filter-value">{clip.filters[f.key]}</span>
            </div>
          ))}
          {showAllFilters && filterGroups.advanced.map(f => (
            <div key={f.key} className="filter-row">
              <label>{f.label}</label>
              <input type="range" min={f.min} max={f.max} value={clip.filters[f.key]} onChange={(e) => handleFilterChange(f.key, parseInt(e.target.value))} />
              <span className="filter-value">{clip.filters[f.key]}</span>
            </div>
          ))}
          <button className="show-more-btn" onClick={() => setShowAllFilters(!showAllFilters)}>
            {showAllFilters ? 'Show Less' : 'Show More Filters'}
          </button>
        </div>
      )}

      {activeSection === 'animation' && (
        <div className="animation-section">
          {clip.animation && (
            <div className="current-animation">
              <h4>Current Animation</h4>
              <div className="animation-info">
                <span className="anim-name">{clip.animation.name}</span>
                <span className="anim-type">{clip.animation.type}</span>
                <span className="anim-duration">{clip.animation.duration}s</span>
                <button className="remove-anim-btn" onClick={handleRemoveAnimation}>Remove</button>
              </div>
            </div>
          )}
          <h4>Entrance</h4>
          <div className="animation-grid">
            {ANIMATION_PRESETS.filter(a => a.type === 'entrance').map(preset => (
              <button key={preset.id} className={`anim-preset ${clip.animation?.id === preset.id ? 'active' : ''}`} onClick={() => handleApplyAnimation(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
          <h4>Emphasis</h4>
          <div className="animation-grid">
            {ANIMATION_PRESETS.filter(a => a.type === 'emphasis').map(preset => (
              <button key={preset.id} className={`anim-preset ${clip.animation?.id === preset.id ? 'active' : ''}`} onClick={() => handleApplyAnimation(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
          <h4>Exit</h4>
          <div className="animation-grid">
            {ANIMATION_PRESETS.filter(a => a.type === 'exit').map(preset => (
              <button key={preset.id} className={`anim-preset ${clip.animation?.id === preset.id ? 'active' : ''}`} onClick={() => handleApplyAnimation(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;
