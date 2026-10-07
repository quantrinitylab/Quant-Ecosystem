// ============================================================================
// Shared UI - NetworkQuality Component
// ============================================================================

import React from 'react';
import { ConnectionQuality } from 'livekit-client';

export interface NetworkQualityProps {
  quality: ConnectionQuality;
  className?: string;
}

const qualityLevels: Record<ConnectionQuality, { bars: number; label: string; color: string }> = {
  [ConnectionQuality.Excellent]: { bars: 4, label: 'Excellent', color: 'bg-green-500' },
  [ConnectionQuality.Good]: { bars: 3, label: 'Good', color: 'bg-green-400' },
  [ConnectionQuality.Poor]: { bars: 2, label: 'Poor', color: 'bg-yellow-500' },
  [ConnectionQuality.Lost]: { bars: 0, label: 'Lost', color: 'bg-red-500' },
  [ConnectionQuality.Unknown]: { bars: 1, label: 'Unknown', color: 'bg-gray-400' },
};

export const NetworkQuality: React.FC<NetworkQualityProps> = ({ quality, className = '' }) => {
  const { bars, label, color } = qualityLevels[quality] ?? qualityLevels[ConnectionQuality.Unknown];
  const maxBars = 4;

  return (
    <div
      className={`flex items-end gap-0.5 ${className}`}
      title={`Connection: ${label}`}
      data-testid="network-quality"
      aria-label={`Connection quality: ${label}`}
    >
      {Array.from({ length: maxBars }, (_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${i < bars ? color : 'bg-gray-600'}`}
          style={{ height: `${(i + 1) * 4}px` }}
        />
      ))}
    </div>
  );
};
