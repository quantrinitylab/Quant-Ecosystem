// ============================================================================
// QuantAI - Models Gallery Page
// ============================================================================

import type { AIModel } from '../types';

interface ModelsPageProps { models: AIModel[]; onSelectModel: (id: string) => void; onCompare: (ids: string[]) => void; }

export function ModelsPage({ models, onSelectModel, onCompare }: ModelsPageProps) {
  return { type: 'div', className: 'models-page', children: [
    { type: 'h1', text: 'AI Models' },
    { type: 'div', className: 'models-grid', children: models.map(m => ({
      type: 'div', className: `model-card ${m.status}`, onClick: () => onSelectModel(m.id), children: [
        { type: 'h3', text: m.name },
        { type: 'span', text: `${m.provider} v${m.version}`, className: 'provider' },
        { type: 'div', className: 'capabilities', children: m.capabilities.map(c => ({ type: 'span', className: 'cap-badge', text: c })) },
        { type: 'div', className: 'stats', children: [{ type: 'span', text: `${m.contextWindow / 1000}K ctx` }, { type: 'span', text: `${m.latencyMs}ms` }, { type: 'span', text: `$${m.costPer1kTokens.input}/1K` }] },
        m.isFineTuned ? { type: 'span', className: 'ft-badge', text: 'Fine-tuned' } : null,
      ],
    }))},
  ]};
}

export default ModelsPage;
