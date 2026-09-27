// ============================================================================
// QuantWave Orange Proximity Radar & Tinder-Class Swipe Deck Component
// ============================================================================

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface RadarUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  distanceKm: number;
  bio: string | null;
  interests: string[];
  mutualMatch: boolean;
}

export function ProximityRadarView() {
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [users, setUsers] = useState<RadarUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState<RadarUser | null>(null);
  const [matchModal, setMatchModal] = useState<{
    open: boolean;
    matchId?: string;
    user?: RadarUser;
  }>({
    open: false,
  });

  const radii = [5, 25, 50, 100];

  useEffect(() => {
    fetchNearbyUsers(radiusKm);
  }, [radiusKm]);

  async function fetchNearbyUsers(r: number) {
    setLoading(true);
    try {
      // Default coordinates (e.g., Delhi center or client GPS)
      const lat = 28.6139;
      const lon = 77.209;
      const res = await fetch(`/api/radar/nearby?lat=${lat}&lon=${lon}&radiusKm=${r}`, {
        headers: {
          'x-user-id': 'user_current_session',
        },
      });
      const json = await res.json();
      if (json.success && json.data?.users) {
        setUsers(json.data.users);
      } else {
        // Fallback mock data if backend not running or unseeded
        setUsers([
          {
            id: 'u_1',
            name: 'Aanya Sharma',
            username: 'aanya',
            avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
            distanceKm: 2.4,
            bio: 'Coffee lover, tech enthusiast, and weekend hiker ☕⛰️',
            interests: ['Coffee', 'Tech', 'Hiking'],
            mutualMatch: false,
          },
          {
            id: 'u_2',
            name: 'Kabir Mehta',
            username: 'kabir',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
            distanceKm: 8.1,
            bio: 'Building AI agents and playing indie guitar riffs 🎸🤖',
            interests: ['AI', 'Music', 'Coding'],
            mutualMatch: false,
          },
          {
            id: 'u_3',
            name: 'Zara Khan',
            username: 'zara',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
            distanceKm: 19.5,
            bio: 'UX designer & foodie exploring rooftop cafes 🍜✨',
            interests: ['Design', 'Food', 'Art'],
            mutualMatch: false,
          },
        ]);
      }
    } catch {
      setUsers([
        {
          id: 'u_1',
          name: 'Aanya Sharma',
          username: 'aanya',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          distanceKm: 2.4,
          bio: 'Coffee lover, tech enthusiast, and weekend hiker ☕⛰️',
          interests: ['Coffee', 'Tech', 'Hiking'],
          mutualMatch: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwipe(targetUserId: string, action: 'like' | 'pass' | 'superlike') {
    try {
      const res = await fetch('/api/radar/swipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user_current_session',
        },
        body: JSON.stringify({ targetUserId, action }),
      });
      const json = await res.json();
      if (json.success && json.data?.matched) {
        const matchedUser = users.find((u) => u.id === targetUserId);
        setMatchModal({ open: true, matchId: json.data.matchId, user: matchedUser });
      }
    } catch {
      // Fallback local match simulation if offline
      if (action === 'like' || action === 'superlike') {
        const matchedUser = users.find((u) => u.id === targetUserId);
        if (Math.random() > 0.5) {
          setMatchModal({ open: true, matchId: 'match_simulated_123', user: matchedUser });
        }
      }
    }

    // Advance to next user
    setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
    setSelectedUser(null);
  }

  return (
    <div className="relative min-h-[700px] w-full rounded-2xl bg-gradient-to-b from-zinc-950 via-zinc-900 to-black p-6 text-white shadow-2xl overflow-hidden flex flex-col items-center justify-between">
      {/* Header & Radius selector */}
      <div className="flex w-full max-w-4xl items-center justify-between z-10 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
            📡 QuantWave Proximity Radar
          </h2>
          <p className="text-xs text-zinc-400">Discovering matches within your radial geofence</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/80 p-1.5 rounded-full border border-zinc-800 backdrop-blur-md">
          {radii.map((r) => (
            <button
              key={r}
              onClick={() => setRadiusKm(r)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                radiusKm === r
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-black font-semibold shadow-lg shadow-orange-500/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* Center Radar Scanner UI */}
      <div className="relative my-8 flex h-[360px] w-[360px] items-center justify-center rounded-full border border-orange-500/20 bg-orange-950/10">
        {/* Concentric Glowing Circles */}
        <div className="absolute h-[320px] w-[320px] rounded-full border border-orange-500/20 animate-pulse" />
        <div className="absolute h-[220px] w-[220px] rounded-full border border-orange-500/30" />
        <div className="absolute h-[120px] w-[120px] rounded-full border border-orange-500/40" />

        {/* Rotating Radar Sweep Line */}
        <div className="absolute inset-0 rounded-full animate-spin duration-[4000ms] pointer-events-none">
          <div className="h-1/2 w-1/2 bg-gradient-to-br from-orange-500/40 to-transparent rounded-tl-full" />
        </div>

        {/* Center Blip (Self) */}
        <div className="absolute h-4 w-4 rounded-full bg-orange-500 shadow-lg shadow-orange-500 animate-ping" />
        <div className="absolute h-3 w-3 rounded-full bg-orange-400" />

        {/* User Blips */}
        {!loading &&
          users.map((u, idx) => {
            // Compute deterministic angle & radius based on distance
            const angle = (idx * 137.5 * Math.PI) / 180;
            const normDist = Math.min(u.distanceKm / radiusKm, 0.85);
            const rPx = normDist * 140;
            const x = Math.cos(angle) * rPx;
            const y = Math.sin(angle) * rPx;

            return (
              <motion.button
                key={u.id}
                whileHover={{ scale: 1.2 }}
                onClick={() => setSelectedUser(u)}
                className="absolute group flex flex-col items-center cursor-pointer z-20"
                style={{ transform: `translate(${x}px, ${y}px)` }}
              >
                <div className="h-10 w-10 rounded-full border-2 border-orange-500 overflow-hidden shadow-md shadow-orange-500/50 bg-zinc-800">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-orange-600 text-xs font-bold text-white">
                      {u.name[0]}
                    </div>
                  )}
                </div>
                <span className="absolute top-11 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300 opacity-0 group-hover:opacity-100 transition-opacity border border-orange-500/30">
                  {u.name} • {u.distanceKm} km
                </span>
              </motion.button>
            );
          })}
      </div>

      {/* Swipe Deck Active Card Overlay / Prompt */}
      <div className="w-full max-w-sm z-10 mb-4">
        {users.length > 0 ? (
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{users[0].name}</h3>
                <span className="inline-block mt-0.5 rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-medium text-orange-400 border border-orange-500/30">
                  📍 {users[0].distanceKm} km away
                </span>
              </div>
              <div className="h-14 w-14 rounded-full overflow-hidden border border-orange-500/40">
                <img
                  src={users[0].avatar || ''}
                  alt={users[0].name}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-300 line-clamp-2 mb-3">{users[0].bio}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {users[0].interests.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
            {/* Action Buttons */}
            <div className="flex items-center justify-around">
              <button
                onClick={() => handleSwipe(users[0].id, 'pass')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-lg"
                title="Pass"
              >
                ✕
              </button>
              <button
                onClick={() => handleSwipe(users[0].id, 'superlike')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-lg"
                title="Superlike"
              >
                ⭐
              </button>
              <button
                onClick={() => handleSwipe(users[0].id, 'like')}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all shadow-lg text-lg"
                title="Like"
              >
                ❤️
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-900/60 p-6 text-center border border-zinc-800">
            <p className="text-sm text-zinc-400">No more profiles nearby in this radius.</p>
            <button
              onClick={() => fetchNearbyUsers(radiusKm)}
              className="mt-3 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-orange-400"
            >
              Refresh Radar
            </button>
          </div>
        )}
      </div>

      {/* Mutual Match Modal */}
      <AnimatePresence>
        {matchModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="w-full max-w-md rounded-3xl bg-gradient-to-b from-zinc-900 to-zinc-950 p-8 text-center border border-orange-500/30 shadow-2xl"
            >
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-2xl font-bold text-orange-500 mb-1">It's a Mutual Match!</h3>
              <p className="text-xs text-zinc-300 mb-6">
                You and {matchModal.user?.name || 'your match'} liked each other.
              </p>
              <div className="flex justify-center items-center gap-4 mb-6">
                <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-orange-500 shadow-xl">
                  <img
                    src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400"
                    alt="You"
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="text-2xl text-orange-500">❤️</span>
                <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-orange-500 shadow-xl">
                  <img
                    src={matchModal.user?.avatar || ''}
                    alt="Match"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMatchModal({ open: false })}
                  className="flex-1 rounded-xl bg-zinc-800 py-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  Keep Swiping
                </button>
                <button
                  onClick={() => {
                    alert('Opening 1:1 Secure Video Chat...');
                    setMatchModal({ open: false });
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-3 text-xs font-bold text-black hover:opacity-90 shadow-lg shadow-orange-500/30"
                >
                  📹 Start Video Chat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default ProximityRadarView;
