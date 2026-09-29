// ============================================================================
// QuantNeon - Camera UI Page
// Viewfinder, capture, modes, filters, flash, timer, beauty
// ============================================================================

import React, { useState, useCallback } from 'react';
import { PageTransition, LoadingState } from '@quant/shared-ui';
import { useARFilters } from '../hooks/useARFilters';

type CameraMode = 'Photo' | 'Video' | 'Boomerang' | 'Layout' | 'Hands-Free';
type FlashMode = 'off' | 'on' | 'auto';
type CameraFacing = 'front' | 'back';

const CameraPage: React.FC = () => {
  const { data: filters, isLoading, error } = useARFilters();
  const [currentMode, setCurrentMode] = useState<CameraMode>('Photo');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const modes: CameraMode[] = ['Photo', 'Video', 'Boomerang', 'Layout', 'Hands-Free'];

  const handleCapture = useCallback(() => {
    if (currentMode === 'Video' || currentMode === 'Hands-Free') {
      setIsRecording(!isRecording);
    }
  }, [currentMode, isRecording]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-black dark:bg-[#0F0F14] text-white">
        <div className="max-w-2xl mx-auto">
          {/* Viewfinder */}
          <div className="relative h-[70vh] bg-gray-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">{facing === 'front' ? '🤳' : '📷'}</span>
            </div>
            {selectedFilter && (
              <div className="absolute top-4 left-4 bg-black/50 rounded-full px-3 py-1">
                <span className="text-xs">Filter: {selectedFilter}</span>
              </div>
            )}

            {/* Top controls */}
            <div className="absolute top-4 right-4 flex gap-3">
              <button
                className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-black/50 rounded-full"
                onClick={() => setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'))}
              >
                {flash === 'off' ? '⚡' : flash === 'on' ? '⚡' : '⚡A'}
              </button>
              <button
                className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-black/50 rounded-full"
                onClick={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
              >
                🔄
              </button>
            </div>

            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/80 rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <span className="text-xs font-medium">REC</span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 px-4 py-3 overflow-x-auto">
            {isLoading && <LoadingState variant="dots" text="" size="sm" />}
            {error && <span className="text-red-400 text-xs">Could not load filters</span>}
            {!isLoading &&
              !error &&
              (filters || []).map((filter: { id: string; name: string }) => (
                <button
                  key={filter.id}
                  className={`min-h-[44px] px-3 py-2 rounded-full text-xs whitespace-nowrap ${selectedFilter === filter.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'}`}
                  onClick={() => setSelectedFilter(selectedFilter === filter.id ? null : filter.id)}
                >
                  {filter.name}
                </button>
              ))}
          </div>

          {/* Mode selector */}
          <div className="flex justify-center gap-4 px-4 py-2">
            {modes.map((mode) => (
              <button
                key={mode}
                className={`min-h-[44px] px-3 py-2 text-xs font-medium ${currentMode === mode ? 'text-white border-b-2 border-white' : 'text-gray-500'}`}
                onClick={() => setCurrentMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Capture button */}
          <div className="flex justify-center py-6">
            <button
              className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center ${isRecording ? 'bg-red-500' : 'bg-transparent'}`}
              onClick={handleCapture}
            >
              <div
                className={`rounded-full ${isRecording ? 'w-6 h-6 bg-red-600 rounded-sm' : 'w-12 h-12 bg-white'}`}
              />
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default CameraPage;
