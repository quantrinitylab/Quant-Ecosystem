// ============================================================================
// QuantChat - Bitmoji/Avatar Creator Page
// Face shape, skin tone, hairstyle, eyes, nose, mouth, outfit, save/randomize
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface AvatarConfig {
  faceShape: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyeShape: string;
  eyeColor: string;
  noseShape: string;
  mouthShape: string;
  eyebrowShape: string;
  facialHair: string;
  outfit: string;
  outfitColor: string;
  accessories: string[];
  background: string;
}

interface CategoryOption {
  id: string;
  label: string;
  preview: string;
}

interface BitmojiPageProps {
  userId?: string;
}

const FACE_SHAPES: CategoryOption[] = [
  { id: 'round', label: 'Round', preview: '\u{1F7E0}' },
  { id: 'oval', label: 'Oval', preview: '\u{1F7E1}' },
  { id: 'square', label: 'Square', preview: '\u{1F7E7}' },
  { id: 'heart', label: 'Heart', preview: '\u{1F49B}' },
  { id: 'diamond', label: 'Diamond', preview: '\u{1F537}' },
  { id: 'long', label: 'Long', preview: '\u{1F7E2}' },
];

const SKIN_TONES = ['#FFDBB4', '#EDB98A', '#D08B5B', '#AE5D29', '#694D3D', '#3B2219'];

const HAIR_STYLES: CategoryOption[] = [
  { id: 'short', label: 'Short', preview: '\u{1F468}' },
  { id: 'medium', label: 'Medium', preview: '\u{1F9D1}' },
  { id: 'long', label: 'Long', preview: '\u{1F469}' },
  { id: 'curly', label: 'Curly', preview: '\u{1F9D1}\u200D\u{1F9B1}' },
  { id: 'buzz', label: 'Buzz Cut', preview: '\u{1F468}\u200D\u{1F9B2}' },
  { id: 'afro', label: 'Afro', preview: '\u{1F9D1}\u200D\u{1F9B1}' },
  { id: 'ponytail', label: 'Ponytail', preview: '\u{1F469}' },
  { id: 'bun', label: 'Bun', preview: '\u{1F469}' },
  { id: 'mohawk', label: 'Mohawk', preview: '\u{1F9D1}' },
  { id: 'braids', label: 'Braids', preview: '\u{1F469}' },
  { id: 'bald', label: 'Bald', preview: '\u{1F468}\u200D\u{1F9B2}' },
  { id: 'wavy', label: 'Wavy', preview: '\u{1F9D1}' },
];

const HAIR_COLORS = [
  '#000000',
  '#2C1B18',
  '#4A3728',
  '#8B6914',
  '#B8860B',
  '#D4A76A',
  '#E8C07A',
  '#FF4500',
  '#8B0000',
  '#FF69B4',
  '#800080',
  '#4169E1',
  '#00CED1',
];

const EYE_SHAPES: CategoryOption[] = [
  { id: 'round', label: 'Round', preview: '\u{1F441}' },
  { id: 'almond', label: 'Almond', preview: '\u{1F441}' },
  { id: 'upturned', label: 'Upturned', preview: '\u{1F441}' },
  { id: 'downturned', label: 'Downturned', preview: '\u{1F441}' },
  { id: 'monolid', label: 'Monolid', preview: '\u{1F441}' },
  { id: 'hooded', label: 'Hooded', preview: '\u{1F441}' },
];

const EYE_COLORS = ['#634E34', '#2E536F', '#3D671D', '#1C7847', '#8B4513', '#000000', '#808080'];

const OUTFITS: CategoryOption[] = [
  { id: 'casual_tee', label: 'Casual Tee', preview: '\u{1F455}' },
  { id: 'hoodie', label: 'Hoodie', preview: '\u{1F9E5}' },
  { id: 'suit', label: 'Suit', preview: '\u{1F454}' },
  { id: 'dress', label: 'Dress', preview: '\u{1F457}' },
  { id: 'sporty', label: 'Sporty', preview: '\u{1F3BD}' },
  { id: 'leather', label: 'Leather Jacket', preview: '\u{1F9E5}' },
  { id: 'sweater', label: 'Sweater', preview: '\u{1F9E5}' },
  { id: 'polo', label: 'Polo', preview: '\u{1F455}' },
];

const ACCESSORIES = [
  'glasses',
  'sunglasses',
  'earrings',
  'necklace',
  'hat',
  'headband',
  'piercing',
  'scarf',
];

type EditorTab = 'face' | 'hair' | 'eyes' | 'nose' | 'mouth' | 'outfit' | 'accessories';

export const BitmojiPage: React.FC<BitmojiPageProps> = ({ userId }) => {
  const [config, setConfig] = useState<AvatarConfig>({
    faceShape: 'oval',
    skinTone: '#FFDBB4',
    hairStyle: 'medium',
    hairColor: '#2C1B18',
    eyeShape: 'almond',
    eyeColor: '#634E34',
    noseShape: 'small',
    mouthShape: 'smile',
    eyebrowShape: 'natural',
    facialHair: 'none',
    outfit: 'casual_tee',
    outfitColor: '#4A90D9',
    accessories: [],
    background: '#FFFC00',
  });
  const [activeTab, setActiveTab] = useState<EditorTab>('face');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAnimation, setPreviewAnimation] = useState<string>('idle');
  const [history, setHistory] = useState<AvatarConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const fetchCurrentAvatar = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bitmoji/current', {
        headers: { ...getAuthHeaders() },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.config) setConfig(data.config);
      }
    } catch (err) {
      logger.error('Failed to load avatar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentAvatar();
  }, [fetchCurrentAvatar]);

  const updateConfig = useCallback(
    (updates: Partial<AvatarConfig>) => {
      setConfig((prev) => {
        const newConfig = { ...prev, ...updates };
        setHistory((h) => [...h.slice(0, historyIndex + 1), prev]);
        setHistoryIndex((i) => i + 1);
        return newConfig;
      });
    },
    [historyIndex],
  );

  const handleUndo = useCallback(() => {
    if (historyIndex >= 0) {
      setConfig(history[historyIndex]);
      setHistoryIndex((i) => i - 1);
    }
  }, [history, historyIndex]);

  const handleRandomize = useCallback(() => {
    const random = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randomConfig: AvatarConfig = {
      faceShape: random(FACE_SHAPES).id,
      skinTone: random(SKIN_TONES),
      hairStyle: random(HAIR_STYLES).id,
      hairColor: random(HAIR_COLORS),
      eyeShape: random(EYE_SHAPES).id,
      eyeColor: random(EYE_COLORS),
      noseShape: random(['small', 'medium', 'large', 'pointed', 'button', 'wide']),
      mouthShape: random(['smile', 'neutral', 'grin', 'pout', 'open']),
      eyebrowShape: random(['natural', 'thick', 'thin', 'arched', 'straight']),
      facialHair: random(['none', 'beard', 'mustache', 'goatee', 'stubble']),
      outfit: random(OUTFITS).id,
      outfitColor: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`,
      accessories: ACCESSORIES.filter(() => Math.random() > 0.7),
      background: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`,
    };
    setHistory((h) => [...h, config]);
    setHistoryIndex((i) => i + 1);
    setConfig(randomConfig);
  }, [config]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/bitmoji/save', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ config }),
      });
      if (!response.ok) throw new Error('Failed to save avatar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const toggleAccessory = useCallback((acc: string) => {
    setConfig((prev) => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter((a) => a !== acc)
        : [...prev.accessories, acc],
    }));
  }, []);

  const avatarPreview = useMemo(() => {
    return { faceEmoji: '\u{1F9D1}', hairEmoji: config.hairStyle === 'bald' ? '' : '\u{1F487}' };
  }, [config]);

  if (loading)
    return (
      <div className="bitmoji-loading">
        <div className="spinner">Loading avatar editor...</div>
      </div>
    );

  return (
    <div className="bitmoji-page">
      <header className="bitmoji-header">
        <h1>Create Your Avatar</h1>
        <div className="header-actions">
          <button onClick={handleUndo} disabled={historyIndex < 0} className="undo-btn">
            Undo
          </button>
          <button onClick={handleRandomize} className="random-btn">
            Randomize
          </button>
          <button onClick={handleSave} disabled={saving} className="save-btn">
            {saving ? 'Saving...' : 'Save Avatar'}
          </button>
        </div>
      </header>

      <div className="bitmoji-layout">
        <div className="preview-panel">
          <div className="avatar-preview" style={{ backgroundColor: config.background }}>
            <div className="avatar-body" style={{ color: config.skinTone }}>
              <div className="avatar-face" style={{ borderColor: config.skinTone }}>
                <div
                  className="face-shape"
                  data-shape={config.faceShape}
                  style={{ backgroundColor: config.skinTone }}
                >
                  <div
                    className="hair"
                    style={{ backgroundColor: config.hairColor }}
                    data-style={config.hairStyle}
                  ></div>
                  <div className="eyebrows" data-shape={config.eyebrowShape}></div>
                  <div className="eyes" data-shape={config.eyeShape}>
                    <div className="iris" style={{ backgroundColor: config.eyeColor }}></div>
                  </div>
                  <div className="nose" data-shape={config.noseShape}></div>
                  <div className="mouth" data-shape={config.mouthShape}></div>
                  {config.facialHair !== 'none' && (
                    <div
                      className="facial-hair"
                      data-type={config.facialHair}
                      style={{ backgroundColor: config.hairColor }}
                    ></div>
                  )}
                </div>
              </div>
              <div
                className="avatar-outfit"
                style={{ backgroundColor: config.outfitColor }}
                data-outfit={config.outfit}
              ></div>
              {config.accessories.map((acc) => (
                <div key={acc} className={`accessory accessory-${acc}`}></div>
              ))}
            </div>
          </div>
          <div className="animation-controls">
            {['idle', 'wave', 'dance', 'laugh', 'think'].map((anim) => (
              <button
                key={anim}
                onClick={() => setPreviewAnimation(anim)}
                className={previewAnimation === anim ? 'active' : ''}
              >
                {anim}
              </button>
            ))}
          </div>
        </div>

        <div className="editor-panel">
          <nav className="editor-tabs">
            {(
              ['face', 'hair', 'eyes', 'nose', 'mouth', 'outfit', 'accessories'] as EditorTab[]
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={activeTab === tab ? 'active' : ''}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>

          <div className="editor-content">
            {activeTab === 'face' && (
              <div className="face-editor">
                <h3>Face Shape</h3>
                <div className="options-grid">
                  {FACE_SHAPES.map((shape) => (
                    <button
                      key={shape.id}
                      onClick={() => updateConfig({ faceShape: shape.id })}
                      className={config.faceShape === shape.id ? 'selected' : ''}
                    >
                      <span className="option-preview">{shape.preview}</span>
                      <span>{shape.label}</span>
                    </button>
                  ))}
                </div>
                <h3>Skin Tone</h3>
                <div className="color-picker-row">
                  {SKIN_TONES.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => updateConfig({ skinTone: tone })}
                      className={`color-swatch ${config.skinTone === tone ? 'selected' : ''}`}
                      style={{ backgroundColor: tone }}
                    ></button>
                  ))}
                </div>
                <h3>Facial Hair</h3>
                <div className="options-row">
                  {['none', 'stubble', 'mustache', 'goatee', 'beard', 'full'].map((fh) => (
                    <button
                      key={fh}
                      onClick={() => updateConfig({ facialHair: fh })}
                      className={config.facialHair === fh ? 'selected' : ''}
                    >
                      {fh}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'hair' && (
              <div className="hair-editor">
                <h3>Hairstyle</h3>
                <div className="options-grid">
                  {HAIR_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => updateConfig({ hairStyle: style.id })}
                      className={config.hairStyle === style.id ? 'selected' : ''}
                    >
                      <span className="option-preview">{style.preview}</span>
                      <span>{style.label}</span>
                    </button>
                  ))}
                </div>
                <h3>Hair Color</h3>
                <div className="color-picker-row">
                  {HAIR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateConfig({ hairColor: color })}
                      className={`color-swatch ${config.hairColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                    ></button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'eyes' && (
              <div className="eyes-editor">
                <h3>Eye Shape</h3>
                <div className="options-grid">
                  {EYE_SHAPES.map((shape) => (
                    <button
                      key={shape.id}
                      onClick={() => updateConfig({ eyeShape: shape.id })}
                      className={config.eyeShape === shape.id ? 'selected' : ''}
                    >
                      <span className="option-preview">{shape.preview}</span>
                      <span>{shape.label}</span>
                    </button>
                  ))}
                </div>
                <h3>Eye Color</h3>
                <div className="color-picker-row">
                  {EYE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateConfig({ eyeColor: color })}
                      className={`color-swatch ${config.eyeColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                    ></button>
                  ))}
                </div>
                <h3>Eyebrow Shape</h3>
                <div className="options-row">
                  {['natural', 'thick', 'thin', 'arched', 'straight', 'bushy'].map((eb) => (
                    <button
                      key={eb}
                      onClick={() => updateConfig({ eyebrowShape: eb })}
                      className={config.eyebrowShape === eb ? 'selected' : ''}
                    >
                      {eb}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'nose' && (
              <div className="nose-editor">
                <h3>Nose Shape</h3>
                <div className="options-row">
                  {[
                    'small',
                    'medium',
                    'large',
                    'pointed',
                    'button',
                    'wide',
                    'upturned',
                    'roman',
                  ].map((ns) => (
                    <button
                      key={ns}
                      onClick={() => updateConfig({ noseShape: ns })}
                      className={config.noseShape === ns ? 'selected' : ''}
                    >
                      {ns}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'mouth' && (
              <div className="mouth-editor">
                <h3>Mouth Shape</h3>
                <div className="options-row">
                  {['smile', 'neutral', 'grin', 'pout', 'open', 'smirk', 'laugh', 'teeth'].map(
                    (ms) => (
                      <button
                        key={ms}
                        onClick={() => updateConfig({ mouthShape: ms })}
                        className={config.mouthShape === ms ? 'selected' : ''}
                      >
                        {ms}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {activeTab === 'outfit' && (
              <div className="outfit-editor">
                <h3>Outfit</h3>
                <div className="options-grid">
                  {OUTFITS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => updateConfig({ outfit: o.id })}
                      className={config.outfit === o.id ? 'selected' : ''}
                    >
                      <span className="option-preview">{o.preview}</span>
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <h3>Color</h3>
                <input
                  type="color"
                  value={config.outfitColor}
                  onChange={(e) => updateConfig({ outfitColor: e.target.value })}
                  className="color-input"
                />
                <h3>Background</h3>
                <input
                  type="color"
                  value={config.background}
                  onChange={(e) => updateConfig({ background: e.target.value })}
                  className="color-input"
                />
              </div>
            )}
            {activeTab === 'accessories' && (
              <div className="accessories-editor">
                <h3>Accessories</h3>
                <div className="accessories-grid">
                  {ACCESSORIES.map((acc) => (
                    <button
                      key={acc}
                      onClick={() => toggleAccessory(acc)}
                      className={config.accessories.includes(acc) ? 'selected' : ''}
                    >
                      {acc}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default BitmojiPage;
