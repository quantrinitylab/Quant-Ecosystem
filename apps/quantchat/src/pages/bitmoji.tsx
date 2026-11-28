// ============================================================================
// QuantChat - Bitmoji/Avatar Creator Page
// Face shape, skin tone, hairstyle, eyes, nose, mouth, outfit, save/randomize
// QC-F-002 fast-follow (2026-10-25, loop-build): this page was the leftover
// of the P0 unstyled-pages finding — its custom classes were defined in no
// stylesheet, its avatar preview rendered no geometry, and its animation
// buttons changed nothing. Converted to the Tailwind/token system settings
// and discover already use; the preview is now an SVG composed from config
// (AvatarPreview below); animation state drives the preview wrapper via
// data-animation plus a real Tailwind animate class. Save/load behaviour
// (QC-F-089) is unchanged. The dead avatarPreview useMemo (emoji-based,
// never rendered) was removed, not rendered: geometry replaces it.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

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


// --- QC-F-002 fast-follow: SVG avatar geometry (no stylesheet needed) --------
// The old preview was bare divs carrying only data-* attributes and inline
// background colors, so with no stylesheet the user saw no composed avatar.
// Each part below is real SVG geometry driven by the same config the editor
// edits; a part whose config value means "absent" (bald, facialHair 'none')
// renders nothing, honestly, instead of an empty box.
const ANIMATION_CLASSES: Record<string, string> = {
  idle: '',
  wave: 'animate-bounce',
  dance: 'animate-pulse',
  laugh: 'animate-bounce',
  think: 'animate-pulse',
};

function faceGeometry(faceShape: string): { kind: 'ellipse' | 'rect'; rx: number; ry: number } {
  switch (faceShape) {
    case 'round': return { kind: 'ellipse', rx: 52, ry: 50 };
    case 'square': return { kind: 'rect', rx: 46, ry: 56 };
    case 'heart': return { kind: 'ellipse', rx: 48, ry: 52 };
    case 'diamond': return { kind: 'ellipse', rx: 44, ry: 56 };
    case 'long': return { kind: 'ellipse', rx: 42, ry: 60 };
    default: return { kind: 'ellipse', rx: 46, ry: 56 }; // oval
  }
}

function hairPath(hairStyle: string): string | null {
  switch (hairStyle) {
    case 'bald': return null;
    case 'short':
      return 'M54 110 Q50 50 100 48 Q150 50 146 110 Q130 78 100 76 Q70 78 54 110 Z';
    case 'medium':
      return 'M48 150 Q44 50 100 46 Q156 50 152 150 Q140 84 100 82 Q60 84 48 150 Z';
    case 'long':
      return 'M44 190 Q40 50 100 44 Q160 50 156 190 Q140 84 100 82 Q60 84 44 190 Z';
    case 'curly':
      return 'M50 108 Q40 80 58 66 Q48 50 70 52 Q78 34 100 36 Q122 34 130 52 Q152 50 142 66 Q160 80 150 108 Q130 78 100 76 Q70 78 50 108 Z';
    case 'buzz':
      return 'M62 96 Q64 62 100 60 Q136 62 138 96 Q120 76 100 74 Q80 76 62 96 Z';
    case 'afro':
      return 'M52 62 a48 48 0 1 0 96 0 a48 48 0 1 0 -96 0';
    case 'ponytail':
      return 'M54 108 Q50 50 100 48 Q150 50 146 108 Q136 76 100 74 Q64 76 54 108 Z M138 80 Q168 90 162 150 Q150 150 142 100 Z';
    case 'bun':
      return 'M54 108 Q50 50 100 48 Q150 50 146 108 Q136 76 100 74 Q64 76 54 108 Z M100 48 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0';
    case 'mohawk':
      return 'M88 100 Q88 30 100 28 Q112 30 112 100 Q100 80 88 100 Z';
    case 'braids':
      return 'M54 108 Q50 50 100 48 Q150 50 146 108 Q136 76 100 74 Q64 76 54 108 Z M52 100 Q44 150 52 190 Q62 190 62 140 Z M148 100 Q156 150 148 190 Q138 190 138 140 Z';
    case 'wavy':
      return 'M50 108 Q60 70 78 78 Q90 50 100 62 Q110 50 122 78 Q140 70 150 108 Q130 76 100 74 Q70 76 50 108 Z';
    default:
      return 'M48 150 Q44 50 100 46 Q156 50 152 150 Q140 84 100 82 Q60 84 48 150 Z';
  }
}

function eyebrowPath(side: 'left' | 'right', eyebrowShape: string): string {
  const x0 = side === 'left' ? 70 : 108;
  const x1 = side === 'left' ? 92 : 130;
  const mid = (x0 + x1) / 2;
  switch (eyebrowShape) {
    case 'arched': return `M${x0} 86 Q${mid} 74 ${x1} 86`;
    case 'straight': return `M${x0} 84 L${x1} 84`;
    case 'thin': return `M${x0} 85 Q${mid} 80 ${x1} 85`;
    default: return `M${x0} 86 Q${mid} 79 ${x1} 86`; // natural / thick / bushy
  }
}

function eyebrowWidth(eyebrowShape: string): number {
  if (eyebrowShape === 'thick' || eyebrowShape === 'bushy') return 5;
  if (eyebrowShape === 'thin') return 2;
  return 3.5;
}

function eyeProps(eyeShape: string): { rx: number; ry: number; rotate: number } {
  switch (eyeShape) {
    case 'round': return { rx: 10, ry: 10, rotate: 0 };
    case 'upturned': return { rx: 11, ry: 7, rotate: -15 };
    case 'downturned': return { rx: 11, ry: 7, rotate: 15 };
    case 'monolid': return { rx: 11, ry: 4, rotate: 0 };
    case 'hooded': return { rx: 11, ry: 6, rotate: 0 };
    default: return { rx: 12, ry: 7, rotate: 0 }; // almond
  }
}

function nosePath(noseShape: string): string {
  switch (noseShape) {
    case 'medium': return 'M100 108 L96 128 Q100 132 104 128';
    case 'large': return 'M100 106 L94 132 Q100 137 107 132';
    case 'pointed': return 'M100 108 L100 132 L106 128';
    case 'button': return 'M94 126 Q100 132 106 126';
    case 'wide': return 'M92 126 Q100 132 108 126';
    case 'upturned': return 'M96 130 Q100 124 104 130';
    case 'roman': return 'M100 106 L102 128 Q100 133 96 129';
    default: return 'M100 108 L97 126 Q100 130 103 126'; // small
  }
}

function mouthPath(mouthShape: string): string {
  switch (mouthShape) {
    case 'neutral': return 'M86 146 L114 146';
    case 'grin': return 'M84 144 Q100 156 116 144 Q100 150 84 144 Z';
    case 'pout': return 'M92 144 Q100 138 108 144 Q100 150 92 144 Z';
    case 'open': return 'M88 142 Q100 158 112 142 Q100 148 88 142 Z';
    case 'smirk': return 'M86 146 Q104 152 116 140';
    case 'laugh': return 'M84 142 Q100 160 116 142 Q100 150 84 142 Z';
    case 'teeth': return 'M86 143 L114 143 L114 149 L86 149 Z';
    default: return 'M86 144 Q100 156 114 144'; // smile
  }
}

function facialHairPath(facialHair: string): string | null {
  switch (facialHair) {
    case 'beard': return 'M56 128 Q56 172 100 174 Q144 172 144 128 Q132 156 100 158 Q68 156 56 128 Z';
    case 'mustache': return 'M82 136 Q91 130 100 136 Q109 130 118 136 Q109 143 100 141 Q91 143 82 136 Z';
    case 'goatee': return 'M88 138 Q100 132 112 138 Q110 160 100 162 Q90 160 88 138 Z';
    case 'stubble': return 'M60 130 Q60 168 100 170 Q140 168 140 130 Q130 154 100 156 Q70 154 60 130 Z';
    default: return null; // none / full handled as beard below
  }
}

function AvatarPreview({ config, animation }: { config: AvatarConfig; animation: string }) {
  const face = faceGeometry(config.faceShape);
  const hair = hairPath(config.hairStyle);
  const beard = config.facialHair === 'full' ? facialHairPath('beard') : facialHairPath(config.facialHair);
  const eyes = eyeProps(config.eyeShape);
  return (
    <div
      data-testid="avatar-preview"
      data-animation={animation}
      className={`mx-auto aspect-[4/5] w-full max-w-[280px] ${ANIMATION_CLASSES[animation] ?? ''}`}
    >
      <svg
        data-testid="avatar-preview-svg"
        viewBox="0 0 200 250"
        className="h-full w-full"
        role="img"
        aria-label="Avatar preview"
      >
        <rect data-testid="avatar-background" x="0" y="0" width="200" height="250" fill={config.background} />
        <g data-testid="avatar-outfit" data-outfit={config.outfit}>
          <path d="M58 176 L142 176 L152 250 L48 250 Z" fill={config.outfitColor} />
        </g>
        {face.kind === 'rect' ? (
          <rect data-testid="avatar-face" x="54" y="52" width="92" height="112" rx="18" fill={config.skinTone} />
        ) : (
          <ellipse data-testid="avatar-face" cx="100" cy="108" rx={face.rx} ry={face.ry} fill={config.skinTone} />
        )}
        {hair && <path data-testid="avatar-hair" d={hair} fill={config.hairColor} />}
        <g data-testid="avatar-eyebrows" stroke={config.hairColor} strokeWidth={eyebrowWidth(config.eyebrowShape)} strokeLinecap="round" fill="none">
          <path d={eyebrowPath('left', config.eyebrowShape)} />
          <path d={eyebrowPath('right', config.eyebrowShape)} />
        </g>
        <g data-testid="avatar-eyes">
          {[78, 122].map((cx) => (
            <g key={cx} transform={eyes.rotate !== 0 ? `rotate(${cx === 78 ? eyes.rotate : -eyes.rotate} ${cx} 100)` : undefined}>
              <ellipse cx={cx} cy="100" rx={eyes.rx} ry={eyes.ry} fill="#ffffff" />
              <circle data-testid="avatar-iris" cx={cx} cy="100" r="5" fill={config.eyeColor} />
            </g>
          ))}
        </g>
        <path data-testid="avatar-nose" d={nosePath(config.noseShape)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" strokeLinecap="round" />
        <path data-testid="avatar-mouth" d={mouthPath(config.mouthShape)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2" strokeLinecap="round" />
        {beard && <path data-testid="avatar-facial-hair" d={beard} fill={config.hairColor} />}
        {config.accessories.map((acc) => {
          switch (acc) {
            case 'glasses':
              return (
                <g key={acc} data-testid="avatar-accessory-glasses" stroke="#111111" strokeWidth="2" fill="none">
                  <circle cx="78" cy="100" r="13" />
                  <circle cx="122" cy="100" r="13" />
                  <line x1="91" y1="100" x2="109" y2="100" />
                </g>
              );
            case 'sunglasses':
              return (
                <g key={acc} data-testid="avatar-accessory-sunglasses" fill="#111111">
                  <rect x="64" y="92" width="28" height="16" rx="4" />
                  <rect x="108" y="92" width="28" height="16" rx="4" />
                </g>
              );
            case 'earrings':
              return (
                <g key={acc} data-testid="avatar-accessory-earrings" fill="#FFC700">
                  <circle cx="54" cy="132" r="4" />
                  <circle cx="146" cy="132" r="4" />
                </g>
              );
            case 'necklace':
              return (
                <path key={acc} data-testid="avatar-accessory-necklace" d="M78 172 Q100 190 122 172" fill="none" stroke="#FFC700" strokeWidth="2" />
              );
            case 'hat':
              return (
                <g key={acc} data-testid="avatar-accessory-hat" fill="#1f2937">
                  <ellipse cx="100" cy="52" rx="62" ry="10" />
                  <rect x="68" y="20" width="64" height="34" rx="8" />
                </g>
              );
            case 'headband':
              return <rect key={acc} data-testid="avatar-accessory-headband" x="58" y="62" width="84" height="10" rx="5" fill={config.outfitColor} />;
            case 'piercing':
              return <circle key={acc} data-testid="avatar-accessory-piercing" cx="112" cy="128" r="2.5" fill="#e5e7eb" />;
            case 'scarf':
              return <path key={acc} data-testid="avatar-accessory-scarf" d="M72 176 Q100 196 128 176 L128 190 Q100 206 72 190 Z" fill={config.outfitColor} />;
            default:
              return null;
          }
        })}
      </svg>
    </div>
  );
}

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
  const [saved, setSaved] = useState<boolean>(false);
  const [previewAnimation, setPreviewAnimation] = useState<string>('idle');
  const [history, setHistory] = useState<AvatarConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // QC-F-089: this used to call a phantom endpoint and swallow every
  // failure, so the editor always opened on defaults and the user's saved
  // avatar never came back. The endpoint is real now (Next proxy →
  // backend GET /bitmoji/me): a saved config arrives as
  // { success, data: { config, updatedAt } } with config null until the
  // first save, and a failed load is surfaced honestly instead of being
  // mistaken for "no saved avatar".
  const fetchCurrentAvatar = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetchRaw('/api/bitmoji/current', {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) {
        setError('Could not load your saved avatar');
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const savedConfig = (body as { data?: { config?: Partial<AvatarConfig> } } | null)?.data
        ?.config;
      if (savedConfig) {
        setConfig((prev) => ({ ...prev, ...savedConfig }));
      }
    } catch (err) {
      logger.error('Failed to load avatar:', err);
      setError('Could not load your saved avatar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentAvatar();
  }, [fetchCurrentAvatar]);

  const updateConfig = useCallback(
    (updates: Partial<AvatarConfig>) => {
      // Any edit makes the on-screen config unsaved again — the "Avatar
      // saved" confirmation must never describe a config that differs
      // from what the server stored.
      setSaved(false);
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
      setSaved(false);
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
    setSaved(false);
    setConfig(randomConfig);
  }, [config]);

  // QC-F-089: Save posts to the real endpoint now (Next proxy → backend
  // POST /bitmoji, persisted in BitmojiConfig). "Saved" is shown only when
  // the server confirms success — never optimistically — and a failure
  // surfaces the server's own message when it sends one.
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await apiFetchRaw('/api/bitmoji/save', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ config }),
      });
      const body: unknown = await response.json().catch(() => null);
      const envelope = body as {
        success?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || envelope?.success !== true) {
        throw new Error(envelope?.error?.message ?? 'Failed to save avatar');
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const toggleAccessory = useCallback((acc: string) => {
    setSaved(false);
    setConfig((prev) => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter((a) => a !== acc)
        : [...prev.accessories, acc],
    }));
  }, []);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <div className="flex flex-col items-center gap-2" role="status">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--quant-border)] border-t-emerald-500" />
          <span className="text-sm text-[var(--quant-muted-foreground)]">Loading avatar editor...</span>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <Head>
        <title>Avatar Creator — QuantChat</title>
      </Head>
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <h1>Create Your Avatar</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleUndo} disabled={historyIndex < 0} className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium quant-btn-secondary disabled:opacity-50">
            Undo
          </button>
          <button onClick={handleRandomize} className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium quant-btn-secondary">
            Randomize
          </button>
          <button onClick={handleSave} disabled={saving} className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium quant-btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Avatar'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-10 sm:px-6 lg:flex-row">
        <div className="w-full shrink-0 lg:w-[340px]">
          <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-muted)] p-4">
            <AvatarPreview config={config} animation={previewAnimation} />
            <div className="mt-4 flex flex-wrap gap-2">
              {['idle', 'wave', 'dance', 'laugh', 'think'].map((anim) => (
                <button
                  key={anim}
                  onClick={() => setPreviewAnimation(anim)}
                  className={`min-h-[44px] rounded-full border px-4 py-2 text-sm capitalize ${previewAnimation === anim ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--quant-border)]'}`}
                >
                  {anim}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <nav className="flex flex-wrap gap-2">
            {(
              ['face', 'hair', 'eyes', 'nose', 'mouth', 'outfit', 'accessories'] as EditorTab[]
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`min-h-[44px] rounded-full border px-4 py-2 text-sm capitalize ${activeTab === tab ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--quant-border)]'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>

          <div className="mt-4">
            {activeTab === 'face' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Face Shape</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FACE_SHAPES.map((shape) => (
                    <button
                      key={shape.id}
                      onClick={() => updateConfig({ faceShape: shape.id })}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm ${config.faceShape === shape.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      <span className="text-lg leading-none">{shape.preview}</span>
                      <span>{shape.label}</span>
                    </button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Skin Tone</h3>
                <div className="flex flex-wrap gap-2">
                  {SKIN_TONES.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => updateConfig({ skinTone: tone })}
                      className={`h-11 w-11 rounded-full border-2 ${config.skinTone === tone ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                      style={{ backgroundColor: tone }}
                    ></button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Facial Hair</h3>
                <div className="flex flex-wrap gap-2">
                  {['none', 'stubble', 'mustache', 'goatee', 'beard', 'full'].map((fh) => (
                    <button
                      key={fh}
                      onClick={() => updateConfig({ facialHair: fh })}
                      className={`min-h-[44px] rounded-full border px-3 py-2 text-sm capitalize ${config.facialHair === fh ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      {fh}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'hair' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Hairstyle</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {HAIR_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => updateConfig({ hairStyle: style.id })}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm ${config.hairStyle === style.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      <span className="text-lg leading-none">{style.preview}</span>
                      <span>{style.label}</span>
                    </button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Hair Color</h3>
                <div className="flex flex-wrap gap-2">
                  {HAIR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateConfig({ hairColor: color })}
                      className={`h-11 w-11 rounded-full border-2 ${config.hairColor === color ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                      style={{ backgroundColor: color }}
                    ></button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'eyes' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Eye Shape</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {EYE_SHAPES.map((shape) => (
                    <button
                      key={shape.id}
                      onClick={() => updateConfig({ eyeShape: shape.id })}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm ${config.eyeShape === shape.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      <span className="text-lg leading-none">{shape.preview}</span>
                      <span>{shape.label}</span>
                    </button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Eye Color</h3>
                <div className="flex flex-wrap gap-2">
                  {EYE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateConfig({ eyeColor: color })}
                      className={`h-11 w-11 rounded-full border-2 ${config.eyeColor === color ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                      style={{ backgroundColor: color }}
                    ></button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Eyebrow Shape</h3>
                <div className="flex flex-wrap gap-2">
                  {['natural', 'thick', 'thin', 'arched', 'straight', 'bushy'].map((eb) => (
                    <button
                      key={eb}
                      onClick={() => updateConfig({ eyebrowShape: eb })}
                      className={`min-h-[44px] rounded-full border px-3 py-2 text-sm capitalize ${config.eyebrowShape === eb ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      {eb}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'nose' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Nose Shape</h3>
                <div className="flex flex-wrap gap-2">
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
                      className={`min-h-[44px] rounded-full border px-3 py-2 text-sm capitalize ${config.noseShape === ns ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      {ns}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'mouth' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Mouth Shape</h3>
                <div className="flex flex-wrap gap-2">
                  {['smile', 'neutral', 'grin', 'pout', 'open', 'smirk', 'laugh', 'teeth'].map(
                    (ms) => (
                      <button
                        key={ms}
                        onClick={() => updateConfig({ mouthShape: ms })}
                        className={`min-h-[44px] rounded-full border px-3 py-2 text-sm capitalize ${config.mouthShape === ms ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                      >
                        {ms}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {activeTab === 'outfit' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Outfit</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {OUTFITS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => updateConfig({ outfit: o.id })}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm ${config.outfit === o.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
                    >
                      <span className="text-lg leading-none">{o.preview}</span>
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <h3 className="text-base font-semibold">Color</h3>
                <input
                  type="color"
                  aria-label="Outfit color"
                  value={config.outfitColor}
                  onChange={(e) => updateConfig({ outfitColor: e.target.value })}
                  className="h-11 w-20 cursor-pointer rounded-md border border-[var(--quant-border)] bg-transparent p-1"
                />
                <h3 className="text-base font-semibold">Background</h3>
                <input
                  type="color"
                  aria-label="Background color"
                  value={config.background}
                  onChange={(e) => updateConfig({ background: e.target.value })}
                  className="h-11 w-20 cursor-pointer rounded-md border border-[var(--quant-border)] bg-transparent p-1"
                />
              </div>
            )}
            {activeTab === 'accessories' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold">Accessories</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ACCESSORIES.map((acc) => (
                    <button
                      key={acc}
                      onClick={() => toggleAccessory(acc)}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm ${config.accessories.includes(acc) ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-[var(--quant-border)]'}`}
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
        <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="min-h-[44px] rounded-lg px-3 py-1 text-sm quant-btn-ghost">Dismiss</button>
        </div>
      )}
      {saved && !error && (
        <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Avatar saved
          <button onClick={() => setSaved(false)} className="min-h-[44px] rounded-lg px-3 py-1 text-sm quant-btn-ghost">Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default BitmojiPage;
