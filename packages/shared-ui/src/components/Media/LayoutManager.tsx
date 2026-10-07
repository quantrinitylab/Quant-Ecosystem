'use client';
// ============================================================================
// Shared UI - LayoutManager Component
// ============================================================================

import React, { useState } from 'react';

export type LayoutMode = 'grid' | 'speaker' | 'spotlight';

export interface LayoutManagerProps {
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  activeSpeakerId?: string;
  pinnedParticipantId?: string;
  children: React.ReactNode;
  participantCount?: number;
  className?: string;
}

export const LayoutManager: React.FC<LayoutManagerProps> = ({
  mode: controlledMode,
  onModeChange,
  children,
  participantCount = 0,
  className = '',
}) => {
  const [internalMode, setInternalMode] = useState<LayoutMode>('grid');
  const mode = controlledMode ?? internalMode;

  const handleModeChange = (newMode: LayoutMode) => {
    setInternalMode(newMode);
    onModeChange?.(newMode);
  };

  const getLayoutStyles = (): string => {
    switch (mode) {
      case 'grid': {
        const cols =
          participantCount <= 1 ? 1 : participantCount <= 4 ? 2 : participantCount <= 9 ? 3 : 4;
        return `grid grid-cols-${cols} gap-2`;
      }
      case 'speaker':
        return 'flex flex-col';
      case 'spotlight':
        return 'flex flex-col';
      default:
        return 'grid grid-cols-2 gap-2';
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`} data-testid="layout-manager">
      {/* Layout mode switcher */}
      <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => handleModeChange('grid')}
          className={`px-3 py-1 rounded text-xs ${mode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          data-testid="grid-mode-btn"
        >
          Grid
        </button>
        <button
          onClick={() => handleModeChange('speaker')}
          className={`px-3 py-1 rounded text-xs ${mode === 'speaker' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          data-testid="speaker-mode-btn"
        >
          Speaker
        </button>
        <button
          onClick={() => handleModeChange('spotlight')}
          className={`px-3 py-1 rounded text-xs ${mode === 'spotlight' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          data-testid="spotlight-mode-btn"
        >
          Spotlight
        </button>
      </div>

      {/* Layout content */}
      <div className={`flex-1 p-2 ${getLayoutStyles()}`} data-testid="layout-content">
        {children}
      </div>
    </div>
  );
};
