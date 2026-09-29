// ============================================================================
// QuantNeon - ARCamera Component
// ============================================================================

import type { ARFilter } from '../types';

interface ARCameraProps {
  activeFilter: ARFilter | null;
  filters: ARFilter[];
  isRecording: boolean;
  facing: 'front' | 'back';
}

export function ARCamera({ activeFilter, filters, isRecording, facing }: ARCameraProps) {
  return (
    <div
      className="relative flex flex-col h-full bg-black rounded-xl overflow-hidden"
      aria-label="AR Camera"
    >
      {/* Camera Viewport */}
      <div
        className="relative flex-1 min-h-[400px] bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center"
        data-facing={facing}
        aria-label={`Camera facing ${facing}`}
      >
        <div className="w-48 h-64 border-2 border-dashed border-gray-600 rounded-full flex items-center justify-center">
          <span className="text-gray-500 text-sm text-center px-4">
            {facing === 'front' ? 'Front camera' : 'Back camera'}
          </span>
        </div>

        {/* AR Filter Overlay */}
        {activeFilter && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            data-filter={activeFilter.id}
          >
            <span className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
              {activeFilter.name}
            </span>
          </div>
        )}

        {/* Recording Indicator */}
        {isRecording && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span>REC</span>
          </div>
        )}
      </div>

      {/* Camera Controls */}
      <div
        className="flex items-center justify-center gap-6 py-4 bg-gray-900 border-t border-gray-800"
        role="toolbar"
        aria-label="Camera controls"
      >
        <button
          className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors"
          aria-label="Flip camera"
        >
          Flip
        </button>
        <button
          className={`w-16 h-16 rounded-full border-4 border-white transition-colors ${
            isRecording ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Take photo'}
        />
        <button
          className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors"
          aria-label="Open gallery"
        >
          Gallery
        </button>
      </div>

      {/* Filter Strip */}
      <div
        className="flex gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800 overflow-x-auto"
        role="listbox"
        aria-label="AR filters"
      >
        {filters.slice(0, 8).map((f) => (
          <div
            key={f.id}
            className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
              activeFilter?.id === f.id
                ? 'border-blue-500 scale-105 shadow-lg shadow-blue-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
            role="option"
            aria-selected={activeFilter?.id === f.id}
            aria-label={f.name}
          >
            <img src={f.thumbnailUrl} alt={f.name} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ARCamera;
