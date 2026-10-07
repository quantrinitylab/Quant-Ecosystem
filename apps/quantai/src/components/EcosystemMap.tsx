// ============================================================================
// QuantAI - Ecosystem Map Component
// Visual map of all ecosystem AI connections
// ============================================================================

import { useMemo } from 'react';
import type { EcosystemApp } from '../types';

interface EcosystemMapProps {
  apps: EcosystemApp[];
  centralAI: { model: string; requests: number };
  onSelectApp: (id: string) => void;
}

export function EcosystemMap({ apps, centralAI, onSelectApp }: EcosystemMapProps) {
  const radius = 200;
  const containerSize = 500;
  const center = containerSize / 2;

  const appPositions = useMemo(() => {
    const angleStep = (2 * Math.PI) / (apps.length || 1);
    return apps.map((app, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { app, x, y };
    });
  }, [apps]);

  return (
    <div
      className="relative w-full min-h-[500px] bg-gray-900 rounded-xl border border-gray-700 overflow-hidden"
      aria-label="Ecosystem map showing AI connections between apps"
      role="region"
    >
      {/* Central AI Hub Node */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full bg-purple-600 border-4 border-purple-400 shadow-lg shadow-purple-500/30">
          <span className="text-white font-bold text-sm">QuantAI</span>
          <span className="text-purple-200 text-xs">{centralAI.model}</span>
        </div>
      </div>

      {/* Connection Lines (SVG overlay) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${containerSize} ${containerSize}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {appPositions.map(({ app, x, y }) => (
          <line
            key={`line-${app.id}`}
            x1={center}
            y1={center}
            x2={center + x}
            y2={center + y}
            className={app.aiEnabled ? 'stroke-purple-500/50' : 'stroke-gray-600/30'}
            strokeWidth={app.aiEnabled ? 2 : 1}
            strokeDasharray={app.aiEnabled ? undefined : '4 4'}
          />
        ))}
      </svg>

      {/* App Nodes */}
      {appPositions.map(({ app, x, y }) => (
        <button
          key={app.id}
          type="button"
          onClick={() => onSelectApp(app.id)}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center px-3 py-2 rounded-lg border transition-all cursor-pointer ${
            app.aiEnabled
              ? 'bg-gray-800 border-purple-500/50 hover:border-purple-400 hover:bg-gray-750 text-white'
              : 'bg-gray-850 border-gray-600 hover:border-gray-500 text-gray-400'
          }`}
          style={{ marginLeft: `${x}px`, marginTop: `${y}px` }}
          aria-label={`${app.name} - ${app.aiEnabled ? 'AI enabled' : 'AI disabled'}, ${app.aiUsage.requests.toLocaleString()} requests`}
        >
          <span className="text-xs font-medium">{app.name}</span>
          <span className="text-[10px] text-gray-400">
            {app.aiUsage.requests.toLocaleString()} req
          </span>
        </button>
      ))}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-purple-500 inline-block" />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-gray-600 inline-block border-dashed" />
          <span>Inactive</span>
        </div>
      </div>
    </div>
  );
}

export default EcosystemMap;
