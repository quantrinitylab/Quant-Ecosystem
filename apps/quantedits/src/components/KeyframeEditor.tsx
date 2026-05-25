// ============================================================================
// QuantEdits - Keyframe Editor Component
// Property list with keyframe diamonds, easing curves, value graph
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface Keyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingType;
}

interface KeyframeProperty {
  id: string;
  name: string;
  type: 'number' | 'position' | 'rotation' | 'opacity' | 'scale';
  minValue: number;
  maxValue: number;
  currentValue: number;
  keyframes: Keyframe[];
  color: string;
  isExpanded: boolean;
}

type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic' | 'spring';

interface KeyframeEditorProps {
  clipId: string;
  properties: KeyframeProperty[];
  playhead: number;
  duration: number;
  onAddKeyframe: (propertyId: string, time: number, value: number) => void;
  onRemoveKeyframe: (propertyId: string, keyframeId: string) => void;
  onUpdateKeyframe: (propertyId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onUpdateProperty: (propertyId: string, value: number) => void;
}

const EASING_OPTIONS: { type: EasingType; label: string; icon: string }[] = [
  { type: 'linear', label: 'Linear', icon: '/' },
  { type: 'ease-in', label: 'Ease In', icon: '⌒' },
  { type: 'ease-out', label: 'Ease Out', icon: '⌓' },
  { type: 'ease-in-out', label: 'Ease In-Out', icon: '~' },
  { type: 'bounce', label: 'Bounce', icon: '∿' },
  { type: 'elastic', label: 'Elastic', icon: '≋' },
  { type: 'spring', label: 'Spring', icon: '⌇' },
];

const KeyframeEditor: React.FC<KeyframeEditorProps> = ({
  clipId,
  properties,
  playhead,
  duration,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onUpdateProperty,
}) => {
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ propertyId: string; keyframeId: string } | null>(null);
  const [showEasingPicker, setShowEasingPicker] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [graphProperty, setGraphProperty] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const getValueAtTime = useCallback((keyframes: Keyframe[], time: number): number => {
    if (keyframes.length === 0) return 0;
    if (keyframes.length === 1) return keyframes[0].value;
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (time >= sorted[i].time && time <= sorted[i + 1].time) {
        const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        const easedT = applyEasing(t, sorted[i].easing);
        return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * easedT;
      }
    }
    return 0;
  }, []);

  const applyEasing = useCallback((t: number, easing: EasingType): number => {
    switch (easing) {
      case 'linear': return t;
      case 'ease-in': return t * t;
      case 'ease-out': return 1 - (1 - t) * (1 - t);
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'bounce': {
        const n1 = 7.5625; const d1 = 2.75;
        let x = t;
        if (x < 1 / d1) return n1 * x * x;
        else if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
        else if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
        else return n1 * (x -= 2.625 / d1) * x + 0.984375;
      }
      case 'elastic': return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
      case 'spring': return 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6);
      default: return t;
    }
  }, []);

  const handleAddKeyframeAtPlayhead = useCallback((propertyId: string) => {
    const prop = properties.find(p => p.id === propertyId);
    if (!prop) return;
    const value = getValueAtTime(prop.keyframes, playhead);
    onAddKeyframe(propertyId, playhead, value);
  }, [properties, playhead, getValueAtTime, onAddKeyframe]);

  const handleRemoveSelectedKeyframe = useCallback(() => {
    if (!selectedKeyframe) return;
    onRemoveKeyframe(selectedKeyframe.propertyId, selectedKeyframe.keyframeId);
    setSelectedKeyframe(null);
  }, [selectedKeyframe, onRemoveKeyframe]);

  const handleEasingChange = useCallback((easing: EasingType) => {
    if (!selectedKeyframe) return;
    onUpdateKeyframe(selectedKeyframe.propertyId, selectedKeyframe.keyframeId, { easing });
    setShowEasingPicker(false);
  }, [selectedKeyframe, onUpdateKeyframe]);

  const handleKeyframeClick = useCallback((propertyId: string, keyframeId: string) => {
    setSelectedKeyframe({ propertyId, keyframeId });
  }, []);

  const selectedKeyframeData = useMemo(() => {
    if (!selectedKeyframe) return null;
    const prop = properties.find(p => p.id === selectedKeyframe.propertyId);
    return prop?.keyframes.find(k => k.id === selectedKeyframe.keyframeId) || null;
  }, [selectedKeyframe, properties]);

  const graphPoints = useMemo(() => {
    if (!graphProperty) return [];
    const prop = properties.find(p => p.id === graphProperty);
    if (!prop || prop.keyframes.length === 0) return [];
    const points: { x: number; y: number }[] = [];
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const time = (i / steps) * duration;
      const value = getValueAtTime(prop.keyframes, time);
      const normalizedValue = (value - prop.minValue) / (prop.maxValue - prop.minValue);
      points.push({ x: (time / duration) * 100, y: (1 - normalizedValue) * 100 });
    }
    return points;
  }, [graphProperty, properties, duration, getValueAtTime]);

  return (
    <div className="keyframe-editor">
      <div className="keyframe-header">
        <h3>Keyframes</h3>
        <div className="keyframe-controls">
          <button className="add-kf-btn" onClick={() => properties.length > 0 && handleAddKeyframeAtPlayhead(properties[0].id)} title="Add keyframe at playhead">
            &#9670; +
          </button>
          <button className="remove-kf-btn" onClick={handleRemoveSelectedKeyframe} disabled={!selectedKeyframe} title="Remove selected keyframe">
            &#9670; -
          </button>
          <button className={`graph-btn ${showGraph ? 'active' : ''}`} onClick={() => setShowGraph(!showGraph)}>
            Graph
          </button>
          <div className="kf-zoom">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>-</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
          </div>
        </div>
      </div>

      {selectedKeyframeData && (
        <div className="keyframe-details">
          <div className="detail-row">
            <label>Time</label>
            <input type="number" value={selectedKeyframeData.time.toFixed(2)} step={0.01} min={0} max={duration} onChange={(e) => onUpdateKeyframe(selectedKeyframe!.propertyId, selectedKeyframe!.keyframeId, { time: parseFloat(e.target.value) })} />
          </div>
          <div className="detail-row">
            <label>Value</label>
            <input type="number" value={selectedKeyframeData.value.toFixed(2)} step={0.1} onChange={(e) => onUpdateKeyframe(selectedKeyframe!.propertyId, selectedKeyframe!.keyframeId, { value: parseFloat(e.target.value) })} />
          </div>
          <div className="detail-row">
            <label>Easing</label>
            <button className="easing-btn" onClick={() => setShowEasingPicker(!showEasingPicker)}>
              {selectedKeyframeData.easing}
            </button>
          </div>
          {showEasingPicker && (
            <div className="easing-picker">
              {EASING_OPTIONS.map(opt => (
                <button key={opt.type} className={`easing-option ${selectedKeyframeData.easing === opt.type ? 'active' : ''}`} onClick={() => handleEasingChange(opt.type)}>
                  <span className="easing-icon">{opt.icon}</span>
                  <span className="easing-label">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="properties-list">
        {properties.map(prop => (
          <div key={prop.id} className="keyframe-property">
            <div className="property-header">
              <span className="property-color" style={{ backgroundColor: prop.color }} />
              <span className="property-name">{prop.name}</span>
              <span className="property-value">{prop.currentValue.toFixed(1)}</span>
              <button className="graph-toggle" onClick={() => setGraphProperty(graphProperty === prop.id ? null : prop.id)}>
                {graphProperty === prop.id ? '▼' : '▶'}
              </button>
            </div>
            <div className="keyframe-track" style={{ width: `${100 * zoom}%` }}>
              <div className="track-line" />
              <div className="playhead-marker" style={{ left: `${(playhead / duration) * 100}%` }} />
              {prop.keyframes.map(kf => (
                <div
                  key={kf.id}
                  className={`keyframe-diamond ${selectedKeyframe?.keyframeId === kf.id ? 'selected' : ''}`}
                  style={{ left: `${(kf.time / duration) * 100}%` }}
                  onClick={() => handleKeyframeClick(prop.id, kf.id)}
                  title={`${kf.time.toFixed(2)}s: ${kf.value.toFixed(2)}`}
                >
                  &#9670;
                </div>
              ))}
              <button className="add-kf-at-playhead" style={{ left: `${(playhead / duration) * 100}%` }} onClick={() => handleAddKeyframeAtPlayhead(prop.id)} title="Add keyframe here">
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {showGraph && graphProperty && (
        <div className="value-graph">
          <div className="graph-header">
            <span>Value Graph - {properties.find(p => p.id === graphProperty)?.name}</span>
          </div>
          <div className="graph-canvas">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="graph-svg">
              <line x1="0" y1="50" x2="100" y2="50" className="graph-center-line" />
              <polyline points={graphPoints.map(p => `${p.x},${p.y}`).join(' ')} className="graph-curve" fill="none" strokeWidth="0.5" />
              {properties.find(p => p.id === graphProperty)?.keyframes.map(kf => {
                const prop = properties.find(p => p.id === graphProperty)!;
                const x = (kf.time / duration) * 100;
                const y = (1 - (kf.value - prop.minValue) / (prop.maxValue - prop.minValue)) * 100;
                return (<circle key={kf.id} cx={x} cy={y} r="1.5" className="graph-point" onClick={() => handleKeyframeClick(graphProperty, kf.id)} />);
              })}
              <line x1={`${(playhead / duration) * 100}`} y1="0" x2={`${(playhead / duration) * 100}`} y2="100" className="graph-playhead" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyframeEditor;
