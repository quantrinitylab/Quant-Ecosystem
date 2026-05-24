// ============================================================================
// QuantAI - Model Card Component
// ============================================================================

import type { AIModel } from '../types';

interface ModelCardProps { model: AIModel; onSelect: () => void; isSelected: boolean; }

export function ModelCard({ model, onSelect, isSelected }: ModelCardProps) {
  return { type: 'div', className: `model-card ${isSelected ? 'selected' : ''} ${model.status}`, onClick: onSelect, children: [
    { type: 'div', className: 'card-header', children: [{ type: 'h3', text: model.name }, { type: 'span', className: 'provider', text: model.provider }] },
    { type: 'div', className: 'capabilities', children: model.capabilities.map(c => ({ type: 'span', className: 'cap', text: c })) },
    { type: 'div', className: 'specs', children: [
      { type: 'div', children: [{ type: 'label', text: 'Context' }, { type: 'span', text: `${model.contextWindow / 1000}K` }] },
      { type: 'div', children: [{ type: 'label', text: 'Latency' }, { type: 'span', text: `${model.latencyMs}ms` }] },
      { type: 'div', children: [{ type: 'label', text: 'Cost' }, { type: 'span', text: `$${model.costPer1kTokens.input}/1K in` }] },
    ]},
    model.isFineTuned ? { type: 'span', className: 'badge', text: 'Fine-tuned' } : null,
  ]};
}

export default ModelCard;
