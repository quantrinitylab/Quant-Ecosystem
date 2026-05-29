'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@quant/shared-ui';
import { LoadingState } from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';

const friends = [
  { id: '1', name: 'Alex', top: '25%', left: '35%', color: 'bg-emerald-500' },
  { id: '2', name: 'Sam', top: '45%', left: '60%', color: 'bg-indigo-500' },
  { id: '3', name: 'Jordan', top: '60%', left: '25%', color: 'bg-amber-500' },
  { id: '4', name: 'Taylor', top: '35%', left: '75%', color: 'bg-pink-500' },
  { id: '5', name: 'Riley', top: '70%', left: '55%', color: 'bg-purple-500' },
];

const heatMapAreas = [
  { id: '1', top: '30%', left: '40%', size: 'w-24 h-24', color: 'bg-emerald-500/20' },
  { id: '2', top: '55%', left: '50%', size: 'w-32 h-32', color: 'bg-amber-500/15' },
  { id: '3', top: '40%', left: '20%', size: 'w-20 h-20', color: 'bg-indigo-500/20' },
];

export default function MapPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'friends' | 'explore'>('friends');
  const [loading] = useState(false);

  if (loading) return <LoadingState variant="skeleton" text="Loading map..." />;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Map background placeholder */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-teal-800 to-slate-900">
        {/* Map grid lines for visual effect */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute left-0 right-0 border-t border-white"
              style={{ top: `${(i + 1) * 10}%` }}
            />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute top-0 bottom-0 border-l border-white"
              style={{ left: `${(i + 1) * 10}%` }}
            />
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="absolute top-4 left-4 right-4 z-20">
        <div className="bg-[var(--quant-card)]/90 backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg border border-[var(--quant-border)]">
          <span className="text-[var(--quant-muted-foreground)]">&#128270;</span>
          <input
            type="text"
            placeholder="Search locations..."
            className="flex-1 bg-transparent text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] text-sm outline-none"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="absolute top-20 left-4 right-4 z-20">
        <div className="flex bg-black/40 backdrop-blur-sm rounded-full p-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'friends'
                ? 'bg-emerald-500 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Friends
          </button>
          <button
            onClick={() => setActiveTab('explore')}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'explore'
                ? 'bg-emerald-500 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Explore
          </button>
        </div>
      </div>

      {/* Heat map areas */}
      {activeTab === 'explore' &&
        heatMapAreas.map((area) => (
          <div
            key={area.id}
            className={`absolute ${area.size} ${area.color} rounded-full blur-xl z-10`}
            style={{ top: area.top, left: area.left }}
          />
        ))}

      {/* Friend avatars */}
      {activeTab === 'friends' &&
        friends.map((friend) => (
          <div
            key={friend.id}
            className="absolute z-10 flex flex-col items-center gap-1"
            style={{ top: friend.top, left: friend.left }}
          >
            <div
              className={`w-10 h-10 ${friend.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white`}
            >
              {friend.name.charAt(0)}
            </div>
            <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded-full">
              {friend.name}
            </span>
          </div>
        ))}

      {/* My Location button */}
      <div className="absolute bottom-24 right-4 z-20">
        <button className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center text-lg border border-[var(--quant-border)]">
          &#128205;
        </button>
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <BottomNav
          items={navItems}
          activeId="map"
          onChange={(id) => {
            const route = routes[id];
            if (route) router.push(route);
          }}
        />
      </div>
    </div>
  );
}
