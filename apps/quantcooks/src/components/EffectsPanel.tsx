// ============================================================================
// QuantEdits - Effects Panel Component
// Effects browser, transition picker, and applied effects management
// ============================================================================

import type { Effect, AppliedEffect, EffectCategory } from '../types';

interface EffectsPanelProps {
  availableEffects: Effect[];
  appliedEffects: AppliedEffect[];
  selectedCategory: EffectCategory | null;
  onSelectCategory: (category: EffectCategory | null) => void;
  onApplyEffect: (effectId: string) => void;
  onRemoveEffect: (instanceId: string) => void;
  onToggleEffect: (instanceId: string) => void;
  onUpdateParams: (instanceId: string, params: Record<string, unknown>) => void;
  onUpdateIntensity: (instanceId: string, intensity: number) => void;
}

export function EffectsPanel({
  availableEffects,
  appliedEffects,
  selectedCategory,
  onSelectCategory,
  onApplyEffect,
  onRemoveEffect,
  onToggleEffect,
  // TODO: wire up handler
  onUpdateParams: _onUpdateParams,
  onUpdateIntensity,
}: EffectsPanelProps) {
  const filtered = selectedCategory
    ? availableEffects.filter((e) => e.category === selectedCategory)
    : availableEffects;
  const categories: EffectCategory[] = [
    'filter',
    'transition',
    'animation',
    'text-effect',
    'color-grade',
    'blur',
    'distortion',
    'stylize',
  ];

  return (
    <section className="flex flex-col h-full bg-gray-900 text-white" aria-label="Effects panel">
      {/* Applied Effects */}
      <div className="p-3 border-b border-gray-700">
        <h4 className="text-sm font-semibold mb-2">Applied Effects</h4>
        {appliedEffects.length === 0 ? (
          <p className="text-xs text-gray-400">No effects applied</p>
        ) : (
          <ul className="space-y-2" aria-label="Applied effects list">
            {appliedEffects.map((effect) => (
              <li
                key={effect.id}
                className={`flex items-center gap-2 p-2 rounded ${
                  effect.enabled ? 'bg-gray-800' : 'bg-gray-800/50 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleEffect(effect.id)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-xs font-medium bg-gray-700 hover:bg-gray-600"
                  aria-label={`Toggle ${effect.name} ${effect.enabled ? 'off' : 'on'}`}
                >
                  {effect.enabled ? 'ON' : 'OFF'}
                </button>
                <span className="text-sm flex-1 truncate">{effect.name}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(effect.intensity * 100)}
                  onChange={(e) => onUpdateIntensity(effect.id, Number(e.target.value) / 100)}
                  className="w-20 accent-blue-500"
                  aria-label={`${effect.name} intensity`}
                />
                <button
                  type="button"
                  onClick={() => onRemoveEffect(effect.id)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-xs text-red-400 hover:bg-red-900/30"
                  aria-label={`Remove ${effect.name}`}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Effects Library */}
      <div className="flex-1 flex flex-col overflow-hidden p-3">
        <h4 className="text-sm font-semibold mb-2">Effects Library</h4>

        {/* Category Tabs */}
        <nav className="flex flex-wrap gap-1 mb-3" aria-label="Effect categories">
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`px-3 py-1.5 rounded text-xs font-medium min-h-[44px] ${
              !selectedCategory
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize min-h-[44px] ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </nav>

        {/* Effects Grid */}
        <div
          className="grid grid-cols-3 gap-2 overflow-y-auto flex-1"
          role="grid"
          aria-label="Available effects"
        >
          {filtered.map((effect) => (
            <button
              key={effect.id}
              type="button"
              onClick={() => onApplyEffect(effect.id)}
              className="relative flex flex-col items-center gap-1 p-2 rounded bg-gray-800 hover:bg-gray-700 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`Apply ${effect.name}${effect.isPremium ? ' (Premium)' : ''}`}
            >
              <div
                className="w-full aspect-square rounded bg-gray-700 bg-cover bg-center"
                style={{ backgroundImage: `url(${effect.thumbnail})` }}
              />
              <span className="text-xs truncate w-full text-center">{effect.name}</span>
              {effect.isPremium && (
                <span className="absolute top-1 right-1 text-[10px] bg-yellow-600 text-white px-1 rounded">
                  PRO
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default EffectsPanel;
