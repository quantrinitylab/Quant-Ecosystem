// ============================================================================
// QuantLive - Privacy Indicator Component
// ============================================================================

import React from 'react';
import type { QuantLivePrivacyIndicatorProps } from './types';

export const QuantLivePrivacyIndicator: React.FC<QuantLivePrivacyIndicatorProps> = ({
  micActive,
  cameraActive,
  screenSharing,
  className = '',
}) => {
  const hasActiveIndicators = micActive || cameraActive || screenSharing;

  if (!hasActiveIndicators) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Privacy indicators"
      className={`fixed top-2 right-2 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 shadow-lg backdrop-blur-sm text-xs font-medium ${className}`}
    >
      {micActive && (
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
          <span>Mic on</span>
        </span>
      )}
      {cameraActive && (
        <span className="flex items-center gap-1">
          <span aria-hidden="true">&#128247;</span>
          <span>Camera on</span>
        </span>
      )}
      {screenSharing && (
        <span className="flex items-center gap-1">
          <span aria-hidden="true">&#128187;</span>
          <span>Screen shared</span>
        </span>
      )}
    </div>
  );
};
