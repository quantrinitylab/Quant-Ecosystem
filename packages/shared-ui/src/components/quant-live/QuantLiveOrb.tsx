// ============================================================================
// QuantLive - Orb Component
// ============================================================================

import React from 'react';
import type { QuantLiveOrbProps, OrbColorState } from './types';

const colorStyles: Record<OrbColorState, string> = {
  idle: 'bg-gray-400',
  listening: 'bg-blue-500 animate-pulse motion-reduce:animate-none',
  processing: 'bg-amber-500 animate-spin motion-reduce:animate-none',
  speaking: 'bg-green-500 animate-pulse motion-reduce:animate-none',
  error: 'bg-red-500',
};

const stateLabels: Record<OrbColorState, string> = {
  idle: 'Quant Live - idle',
  listening: 'Quant Live - listening',
  processing: 'Quant Live - processing',
  speaking: 'Quant Live - speaking',
  error: 'Quant Live - error',
};

export const QuantLiveOrb: React.FC<QuantLiveOrbProps> = ({
  colorState,
  onClick,
  size = 'sm',
  disabled = false,
  className = '',
}) => {
  const sizeStyles = size === 'lg' ? 'w-16 h-16' : 'w-11 h-11';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-11 min-h-11 ${sizeStyles} rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${colorStyles[colorState]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      aria-label={stateLabels[colorState]}
    >
      <span className="w-3 h-3 rounded-full bg-white/80" aria-hidden="true" />
    </button>
  );
};
