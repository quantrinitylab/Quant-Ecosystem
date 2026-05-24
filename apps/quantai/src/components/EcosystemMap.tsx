// ============================================================================
// QuantAI - Ecosystem Map Component
// Visual map of all ecosystem AI connections
// ============================================================================

import type { EcosystemApp } from '../types';

interface EcosystemMapProps { apps: EcosystemApp[]; centralAI: { model: string; requests: number }; onSelectApp: (id: string) => void; }

export function EcosystemMap({ apps, centralAI, onSelectApp }: EcosystemMapProps) {
  const radius = 200;
  const angleStep = (2 * Math.PI) / apps.length;

  return { type: 'div', className: 'ecosystem-map', children: [
    // Central node
    { type: 'div', className: 'central-node', style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }, children: [
      { type: 'div', className: 'ai-hub', children: [{ type: 'span', text: 'QuantAI' }, { type: 'small', text: centralAI.model }] },
    ]},
    // App nodes
    ...apps.map((app, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { type: 'div', className: `app-node ${app.aiEnabled ? 'enabled' : 'disabled'}`, style: { position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }, onClick: () => onSelectApp(app.id), children: [
        { type: 'span', text: app.name },
        { type: 'small', text: `${app.aiUsage.requests.toLocaleString()} req` },
      ]};
    }),
    // Connection lines (drawn via CSS)
    ...apps.map((app, i) => ({
      type: 'div', className: `connection ${app.aiEnabled ? 'active' : 'inactive'}`, 'data-index': i,
    })),
  ]};
}

export default EcosystemMap;
