'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';

const filters = [
  { id: 'none', label: 'None', color: 'from-gray-600 to-gray-800' },
  { id: 'warm', label: 'Warm', color: 'from-amber-600 to-orange-800' },
  { id: 'cool', label: 'Cool', color: 'from-blue-600 to-cyan-800' },
  { id: 'vintage', label: 'Vintage', color: 'from-yellow-700 to-amber-900' },
  { id: 'noir', label: 'Noir', color: 'from-gray-900 to-black' },
  { id: 'vivid', label: 'Vivid', color: 'from-pink-500 to-purple-700' },
  { id: 'emerald', label: 'Emerald', color: 'from-emerald-600 to-teal-800' },
];

export default function CameraPage() {
  const router = useRouter();
  const [flashOn, setFlashOn] = useState(false);
  const [frontCamera, setFrontCamera] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [isRecording, setIsRecording] = useState(false);

  const activeFilterObj = filters.find((f) => f.id === activeFilter) || filters[0];

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Camera viewfinder placeholder */}
      <div
        className={`absolute inset-0 bg-gradient-to-b ${activeFilterObj.color} transition-all duration-300`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 border border-white/20 rounded-lg" />
        </div>
      </div>

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 pt-6">
        {/* Flash toggle */}
        <button
          onClick={() => setFlashOn(!flashOn)}
          className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm ${
            flashOn ? 'bg-yellow-500/80 text-white' : 'bg-black/30 text-white'
          }`}
          aria-label={flashOn ? 'Flash on' : 'Flash off'}
        >
          &#9889;
        </button>

        {/* Flip camera */}
        <button
          onClick={() => setFrontCamera(!frontCamera)}
          className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
          aria-label="Flip camera"
        >
          &#128260;
        </button>
      </div>

      {/* Camera indicator */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10">
        <span className="text-xs text-white/60 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
          {frontCamera ? 'Front Camera' : 'Rear Camera'}
        </span>
      </div>

      {/* Filter carousel */}
      <div className="absolute bottom-32 left-0 right-0 z-10">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br ${filter.color} border-2 transition-all ${
                activeFilter === filter.id
                  ? 'border-emerald-400 scale-110'
                  : 'border-transparent opacity-70'
              }`}
            >
              <span className="text-white text-[10px] flex items-end justify-center h-full pb-1">
                {filter.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Shutter button */}
      <div className="absolute bottom-20 left-0 right-0 z-10 flex items-center justify-center gap-8">
        <button
          onMouseDown={() => setIsRecording(true)}
          onMouseUp={() => setIsRecording(false)}
          onMouseLeave={() => setIsRecording(false)}
          onTouchStart={() => setIsRecording(true)}
          onTouchEnd={() => setIsRecording(false)}
          className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500 scale-110 border-red-300'
              : 'bg-white/20 backdrop-blur-sm hover:bg-white/30'
          }`}
          aria-label="Capture"
        >
          <div
            className={`rounded-full transition-all ${
              isRecording ? 'w-8 h-8 bg-red-600 rounded-sm' : 'w-14 h-14 bg-white'
            }`}
          />
        </button>
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <BottomNav
          items={navItems}
          activeId="camera"
          onChange={(id) => {
            const route = routes[id];
            if (route) router.push(route);
          }}
        />
      </div>
    </div>
  );
}
