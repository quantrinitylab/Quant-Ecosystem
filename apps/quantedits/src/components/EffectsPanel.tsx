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

export function EffectsPanel({ availableEffects, appliedEffects, selectedCategory, onSelectCategory, onApplyEffect, onRemoveEffect, onToggleEffect, onUpdateParams, onUpdateIntensity }: EffectsPanelProps) {
  const filtered = selectedCategory ? availableEffects.filter(e => e.category === selectedCategory) : availableEffects;
  const categories: EffectCategory[] = ['filter', 'transition', 'animation', 'text-effect', 'color-grade', 'blur', 'distortion', 'stylize'];

  return {
    type: 'div',
    className: 'effects-panel',
    children: [
      // Applied effects
      { type: 'div', className: 'applied-effects', children: [
        { type: 'h4', text: 'Applied Effects' },
        ...appliedEffects.map(effect => ({
          type: 'div',
          className: `applied-effect ${effect.enabled ? '' : 'disabled'}`,
          children: [
            { type: 'button', text: effect.enabled ? 'ON' : 'OFF', onClick: () => onToggleEffect(effect.id), className: 'toggle-btn' },
            { type: 'span', text: effect.name },
            { type: 'input', inputType: 'range', min: 0, max: 100, value: effect.intensity * 100, onChange: (v: number) => onUpdateIntensity(effect.id, v / 100) },
            { type: 'button', text: 'X', onClick: () => onRemoveEffect(effect.id), className: 'remove-btn' },
          ],
        })),
      ]},
      // Effect browser
      { type: 'div', className: 'effect-browser', children: [
        { type: 'h4', text: 'Effects Library' },
        { type: 'div', className: 'category-tabs', children: [
          { type: 'button', text: 'All', className: !selectedCategory ? 'active' : '', onClick: () => onSelectCategory(null) },
          ...categories.map(cat => ({
            type: 'button',
            text: cat,
            className: selectedCategory === cat ? 'active' : '',
            onClick: () => onSelectCategory(cat),
          })),
        ]},
        { type: 'div', className: 'effects-grid', children: filtered.map(effect => ({
          type: 'div',
          className: `effect-card ${effect.isPremium ? 'premium' : ''}`,
          onClick: () => onApplyEffect(effect.id),
          children: [
            { type: 'div', className: 'effect-preview', style: { backgroundImage: `url(${effect.thumbnail})` } },
            { type: 'span', text: effect.name },
          ],
        }))},
      ]},
    ],
  };
}

export default EffectsPanel;
