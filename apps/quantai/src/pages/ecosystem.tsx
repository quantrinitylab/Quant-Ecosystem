// ============================================================================
// QuantAI - Ecosystem AI Control Panel Page
// ============================================================================

import type { EcosystemApp } from '../types';

interface EcosystemPageProps { apps: EcosystemApp[]; onToggleAI: (appId: string) => void; onConfigApp: (appId: string) => void; onChangeModel: (appId: string, modelId: string) => void; }

export function EcosystemPage({ apps, onToggleAI, onConfigApp, onChangeModel }: EcosystemPageProps) {
  const totalCost = apps.reduce((s, a) => s + a.aiUsage.cost, 0);
  const totalRequests = apps.reduce((s, a) => s + a.aiUsage.requests, 0);

  return { type: 'div', className: 'ecosystem-page', children: [
    { type: 'h1', text: 'Ecosystem AI Control' },
    { type: 'div', className: 'overview', children: [{ type: 'div', children: [{ type: 'h3', text: 'Total Requests' }, { type: 'span', text: totalRequests.toLocaleString() }] }, { type: 'div', children: [{ type: 'h3', text: 'Total Cost' }, { type: 'span', text: `$${totalCost.toFixed(2)}` }] }] },
    { type: 'div', className: 'apps-grid', children: apps.map(app => ({
      type: 'div', className: `app-card ${app.aiEnabled ? 'enabled' : 'disabled'}`, children: [
        { type: 'div', className: 'app-header', children: [{ type: 'h3', text: app.name }, { type: 'button', text: app.aiEnabled ? 'AI ON' : 'AI OFF', onClick: () => onToggleAI(app.id), className: `toggle ${app.aiEnabled ? 'on' : 'off'}` }] },
        { type: 'div', className: 'features', children: app.aiFeatures.map(f => ({ type: 'span', className: 'feature-tag', text: f })) },
        { type: 'div', className: 'usage', children: [{ type: 'span', text: `${app.aiUsage.requests.toLocaleString()} req` }, { type: 'span', text: `$${app.aiUsage.cost}` }] },
        { type: 'div', className: 'model', text: `Model: ${app.aiModel}` },
        { type: 'button', text: 'Configure', onClick: () => onConfigApp(app.id) },
      ],
    }))},
  ]};
}

export default EcosystemPage;
