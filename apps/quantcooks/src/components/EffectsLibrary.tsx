// ============================================================================
// QuantEdits - Effects Library Component
// Categories: Transitions/Filters/Overlays/Text/Sound, preview, drag to apply
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface Effect {
  id: string;
  name: string;
  category: EffectCategory;
  thumbnail: string;
  previewUrl: string;
  duration: number;
  isPremium: boolean;
  isFavorite: boolean;
  parameters: EffectParameter[];
  tags: string[];
  usageCount: number;
}

interface EffectParameter {
  name: string;
  type: 'number' | 'color' | 'select' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: string[];
}

type EffectCategory = 'transitions' | 'filters' | 'overlays' | 'text' | 'sound';

interface EffectsLibraryProps {
  onApplyEffect: (effect: Effect) => void;
  onDragStart: (effect: Effect) => void;
  currentClipType: 'video' | 'audio' | 'text' | 'image' | null;
}

const CATEGORIES: { id: EffectCategory; label: string; icon: string }[] = [
  { id: 'transitions', label: 'Transitions', icon: '↔' },
  { id: 'filters', label: 'Filters', icon: '🎨' },
  { id: 'overlays', label: 'Overlays', icon: '◻' },
  { id: 'text', label: 'Text Effects', icon: 'Aa' },
  { id: 'sound', label: 'Sound FX', icon: '🔊' },
];

const EffectsLibrary: React.FC<EffectsLibraryProps> = ({ onApplyEffect, onDragStart, currentClipType }) => {
  const [activeCategory, setActiveCategory] = useState<EffectCategory>('transitions');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [hoveredEffect, setHoveredEffect] = useState<string | null>(null);
  const [effects, setEffects] = useState<Effect[]>(() => {
    const transitions: Effect[] = [
      { id: 'tr-fade', name: 'Fade', category: 'transitions', thumbnail: '/fx/fade.jpg', previewUrl: '/fx/fade.mp4', duration: 0.5, isPremium: false, isFavorite: true, parameters: [{ name: 'Duration', type: 'number', default: 0.5, min: 0.1, max: 3 }], tags: ['smooth', 'basic'], usageCount: 1245 },
      { id: 'tr-dissolve', name: 'Dissolve', category: 'transitions', thumbnail: '/fx/dissolve.jpg', previewUrl: '/fx/dissolve.mp4', duration: 0.8, isPremium: false, isFavorite: false, parameters: [{ name: 'Duration', type: 'number', default: 0.8, min: 0.2, max: 3 }], tags: ['smooth', 'classic'], usageCount: 987 },
      { id: 'tr-slide-left', name: 'Slide Left', category: 'transitions', thumbnail: '/fx/slide-l.jpg', previewUrl: '/fx/slide-l.mp4', duration: 0.6, isPremium: false, isFavorite: false, parameters: [{ name: 'Duration', type: 'number', default: 0.6, min: 0.1, max: 2 }, { name: 'Easing', type: 'select', default: 'ease-out', options: ['linear', 'ease-in', 'ease-out', 'bounce'] }], tags: ['motion', 'slide'], usageCount: 756 },
      { id: 'tr-zoom', name: 'Zoom In', category: 'transitions', thumbnail: '/fx/zoom.jpg', previewUrl: '/fx/zoom.mp4', duration: 0.5, isPremium: false, isFavorite: true, parameters: [{ name: 'Scale', type: 'number', default: 2, min: 1.2, max: 5 }], tags: ['zoom', 'dynamic'], usageCount: 1123 },
      { id: 'tr-wipe', name: 'Wipe Right', category: 'transitions', thumbnail: '/fx/wipe.jpg', previewUrl: '/fx/wipe.mp4', duration: 0.7, isPremium: false, isFavorite: false, parameters: [], tags: ['wipe', 'clean'], usageCount: 543 },
      { id: 'tr-glitch', name: 'Glitch', category: 'transitions', thumbnail: '/fx/glitch.jpg', previewUrl: '/fx/glitch.mp4', duration: 0.3, isPremium: true, isFavorite: false, parameters: [{ name: 'Intensity', type: 'number', default: 50, min: 10, max: 100 }], tags: ['glitch', 'modern', 'edgy'], usageCount: 892 },
    ];
    const filters: Effect[] = [
      { id: 'fl-vintage', name: 'Vintage', category: 'filters', thumbnail: '/fx/vintage.jpg', previewUrl: '/fx/vintage.mp4', duration: 0, isPremium: false, isFavorite: true, parameters: [{ name: 'Intensity', type: 'number', default: 75, min: 0, max: 100 }], tags: ['retro', 'warm'], usageCount: 2341 },
      { id: 'fl-bw', name: 'Black & White', category: 'filters', thumbnail: '/fx/bw.jpg', previewUrl: '/fx/bw.mp4', duration: 0, isPremium: false, isFavorite: false, parameters: [{ name: 'Contrast', type: 'number', default: 20, min: -100, max: 100 }], tags: ['mono', 'classic'], usageCount: 1876 },
      { id: 'fl-cinematic', name: 'Cinematic', category: 'filters', thumbnail: '/fx/cinema.jpg', previewUrl: '/fx/cinema.mp4', duration: 0, isPremium: true, isFavorite: true, parameters: [{ name: 'Teal', type: 'number', default: 30, min: 0, max: 100 }, { name: 'Orange', type: 'number', default: 40, min: 0, max: 100 }], tags: ['film', 'moody', 'teal-orange'], usageCount: 3456 },
      { id: 'fl-warm', name: 'Warm Glow', category: 'filters', thumbnail: '/fx/warm.jpg', previewUrl: '/fx/warm.mp4', duration: 0, isPremium: false, isFavorite: false, parameters: [{ name: 'Temperature', type: 'number', default: 40, min: 0, max: 100 }], tags: ['warm', 'cozy'], usageCount: 1234 },
      { id: 'fl-cool', name: 'Cool Blue', category: 'filters', thumbnail: '/fx/cool.jpg', previewUrl: '/fx/cool.mp4', duration: 0, isPremium: false, isFavorite: false, parameters: [{ name: 'Temperature', type: 'number', default: -30, min: -100, max: 0 }], tags: ['cool', 'modern'], usageCount: 987 },
    ];
    const overlays: Effect[] = [
      { id: 'ov-light-leak', name: 'Light Leak', category: 'overlays', thumbnail: '/fx/leak.jpg', previewUrl: '/fx/leak.mp4', duration: 2, isPremium: false, isFavorite: true, parameters: [{ name: 'Opacity', type: 'number', default: 50, min: 10, max: 100 }, { name: 'Color', type: 'color', default: '#ff6600' }], tags: ['light', 'warm', 'retro'], usageCount: 1567 },
      { id: 'ov-bokeh', name: 'Bokeh', category: 'overlays', thumbnail: '/fx/bokeh.jpg', previewUrl: '/fx/bokeh.mp4', duration: 3, isPremium: false, isFavorite: false, parameters: [{ name: 'Density', type: 'number', default: 50, min: 10, max: 100 }], tags: ['bokeh', 'dreamy'], usageCount: 1234 },
      { id: 'ov-particles', name: 'Particles', category: 'overlays', thumbnail: '/fx/particles.jpg', previewUrl: '/fx/particles.mp4', duration: 5, isPremium: true, isFavorite: false, parameters: [{ name: 'Count', type: 'number', default: 50, min: 10, max: 200 }, { name: 'Speed', type: 'number', default: 1, min: 0.5, max: 3 }], tags: ['particles', 'magic', 'sparkle'], usageCount: 2345 },
    ];
    const textEffects: Effect[] = [
      { id: 'tx-typewriter', name: 'Typewriter', category: 'text', thumbnail: '/fx/typewriter.jpg', previewUrl: '/fx/typewriter.mp4', duration: 2, isPremium: false, isFavorite: true, parameters: [{ name: 'Speed', type: 'number', default: 50, min: 10, max: 200 }], tags: ['type', 'reveal'], usageCount: 2134 },
      { id: 'tx-bounce', name: 'Bounce In', category: 'text', thumbnail: '/fx/bounce-text.jpg', previewUrl: '/fx/bounce-text.mp4', duration: 0.5, isPremium: false, isFavorite: false, parameters: [], tags: ['bounce', 'fun'], usageCount: 1654 },
      { id: 'tx-glitch', name: 'Glitch Text', category: 'text', thumbnail: '/fx/glitch-text.jpg', previewUrl: '/fx/glitch-text.mp4', duration: 1, isPremium: true, isFavorite: false, parameters: [{ name: 'Intensity', type: 'number', default: 50, min: 10, max: 100 }], tags: ['glitch', 'cyber'], usageCount: 1234 },
    ];
    const soundEffects: Effect[] = [
      { id: 'sf-whoosh', name: 'Whoosh', category: 'sound', thumbnail: '/fx/whoosh.jpg', previewUrl: '/fx/whoosh.mp3', duration: 0.5, isPremium: false, isFavorite: true, parameters: [{ name: 'Volume', type: 'number', default: 80, min: 0, max: 100 }], tags: ['transition', 'motion'], usageCount: 3456 },
      { id: 'sf-pop', name: 'Pop', category: 'sound', thumbnail: '/fx/pop.jpg', previewUrl: '/fx/pop.mp3', duration: 0.3, isPremium: false, isFavorite: false, parameters: [], tags: ['ui', 'click'], usageCount: 2345 },
      { id: 'sf-impact', name: 'Impact', category: 'sound', thumbnail: '/fx/impact.jpg', previewUrl: '/fx/impact.mp3', duration: 0.8, isPremium: false, isFavorite: false, parameters: [{ name: 'Reverb', type: 'number', default: 30, min: 0, max: 100 }], tags: ['hit', 'dramatic'], usageCount: 1876 },
    ];
    return [...transitions, ...filters, ...overlays, ...textEffects, ...soundEffects];
  });

  const filteredEffects = useMemo(() => {
    let result = effects.filter(e => e.category === activeCategory);
    if (showFavorites) result = result.filter(e => e.isFavorite);
    if (showRecent) result = result.sort((a, b) => b.usageCount - a.usageCount).slice(0, 6);
    if (searchQuery) result = result.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.tags.some(t => t.includes(searchQuery.toLowerCase())));
    return result;
  }, [effects, activeCategory, showFavorites, showRecent, searchQuery]);

  const handleToggleFavorite = useCallback((effectId: string) => {
    setEffects(prev => prev.map(e => e.id === effectId ? { ...e, isFavorite: !e.isFavorite } : e));
  }, []);

  const handleApply = useCallback((effect: Effect) => {
    setEffects(prev => prev.map(e => e.id === effect.id ? { ...e, usageCount: e.usageCount + 1 } : e));
    onApplyEffect(effect);
  }, [onApplyEffect]);

  return (
    <div className="effects-library">
      <div className="effects-header">
        <h3>Effects</h3>
        <div className="effects-search">
          <input type="text" placeholder="Search effects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="effects-categories">
        {CATEGORIES.map(cat => (
          <button key={cat.id} className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`} onClick={() => setActiveCategory(cat.id)}>
            <span className="cat-icon">{cat.icon}</span>
            <span className="cat-label">{cat.label}</span>
          </button>
        ))}
      </div>

      <div className="effects-filters">
        <button className={`filter-btn ${showFavorites ? 'active' : ''}`} onClick={() => { setShowFavorites(!showFavorites); setShowRecent(false); }}>Favorites</button>
        <button className={`filter-btn ${showRecent ? 'active' : ''}`} onClick={() => { setShowRecent(!showRecent); setShowFavorites(false); }}>Popular</button>
      </div>

      <div className="effects-grid">
        {filteredEffects.length === 0 ? (
          <div className="effects-empty">
            <p>No effects found</p>
          </div>
        ) : (
          filteredEffects.map(effect => (
            <div
              key={effect.id}
              className={`effect-card ${hoveredEffect === effect.id ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredEffect(effect.id)}
              onMouseLeave={() => setHoveredEffect(null)}
              draggable
              onDragStart={() => onDragStart(effect)}
              onClick={() => handleApply(effect)}
            >
              <div className="effect-thumbnail">
                <img src={effect.thumbnail} alt={effect.name} />
                {effect.isPremium && <span className="premium-badge">PRO</span>}
                {hoveredEffect === effect.id && (
                  <div className="effect-preview-overlay">
                    {effect.category === 'sound' ? (
                      <div className="audio-preview">♪ Preview</div>
                    ) : (
                      <video src={effect.previewUrl} autoPlay muted loop className="preview-video" />
                    )}
                  </div>
                )}
              </div>
              <div className="effect-info">
                <span className="effect-name">{effect.name}</span>
                <button className="fav-btn" onClick={(e) => { e.stopPropagation(); handleToggleFavorite(effect.id); }}>
                  {effect.isFavorite ? '★' : '☆'}
                </button>
              </div>
              {effect.duration > 0 && <span className="effect-duration">{effect.duration}s</span>}
            </div>
          ))
        )}
      </div>

      <div className="effects-footer">
        <span>{filteredEffects.length} effects</span>
        {currentClipType && <span className="clip-hint">Drag to apply to {currentClipType} clip</span>}
      </div>
    </div>
  );
};

export default EffectsLibrary;
