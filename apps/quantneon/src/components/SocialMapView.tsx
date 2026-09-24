'use client';

// ============================================================================
// QuantGram (QuantNeon) — Geospatial Social Map Component
// Forensic 98-Screen Instagram Parity (Screens 33-36, 75-78) - Task W39-G07
// Story Location Clusters & Privacy Shield ("Ghost Mode")
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computeStoryClusters,
  filterPinsByPrivacy,
  updatePrivacyShield,
  DEFAULT_PRIVACY_SHIELD,
  type StoryLocationPin,
  type MapCluster,
  type PrivacyShieldSettings,
  type LocationSharingScope,
} from '../features/map/social-map';

export const INITIAL_MAP_PINS: StoryLocationPin[] = [
  {
    id: 'pin-delhi-1',
    storyId: 'story-101',
    userId: 'user-alice',
    username: 'alice_wanderlust',
    displayName: 'Alice Miller',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    mediaThumbnail:
      'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400&auto=format&fit=crop&q=80',
    caption: 'Sunset over India Gate 🇮🇳 #DelhiDiaries',
    lat: 28.6129,
    lng: 77.2295,
    cityName: 'New Delhi',
    landmarkName: 'India Gate',
    postedAt: Date.now() - 3600000,
  },
  {
    id: 'pin-delhi-2',
    storyId: 'story-102',
    userId: 'user-bob',
    username: 'bob_creator',
    displayName: 'Bob Kumar',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    mediaThumbnail:
      'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=400&auto=format&fit=crop&q=80',
    caption: 'Best specialty coffee in CP! ☕',
    lat: 28.6304,
    lng: 77.2177,
    cityName: 'New Delhi',
    landmarkName: 'Connaught Place',
    postedAt: Date.now() - 1800000,
  },
  {
    id: 'pin-mumbai-1',
    storyId: 'story-103',
    userId: 'user-charlie',
    username: 'charlie_vibes',
    displayName: 'Charlie D.',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    mediaThumbnail:
      'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=400&auto=format&fit=crop&q=80',
    caption: 'Evening sea breeze at Marine Drive 🌊',
    lat: 18.944,
    lng: 72.8238,
    cityName: 'Mumbai',
    landmarkName: 'Marine Drive',
    postedAt: Date.now() - 7200000,
  },
  {
    id: 'pin-mumbai-2',
    storyId: 'story-104',
    userId: 'user-dev',
    username: 'dev_lens',
    displayName: 'Dev Sharma',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    mediaThumbnail:
      'https://images.unsplash.com/photo-1567157577867-05ccb1388e66?w=400&auto=format&fit=crop&q=80',
    caption: 'Bandra Bandstand night vibes ✨',
    lat: 19.0544,
    lng: 72.8193,
    cityName: 'Mumbai',
    landmarkName: 'Bandra Bandstand',
    postedAt: Date.now() - 900000,
  },
  {
    id: 'pin-blr-1',
    storyId: 'story-105',
    userId: 'user-emma',
    username: 'emma_tech',
    displayName: 'Emma Watson',
    avatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80',
    mediaThumbnail:
      'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400&auto=format&fit=crop&q=80',
    caption: 'Koramangala tech mixer & rooftop dinner 🍕',
    lat: 12.9352,
    lng: 77.6245,
    cityName: 'Bengaluru',
    landmarkName: 'Koramangala',
    postedAt: Date.now() - 4000000,
  },
];

export interface SocialMapViewProps {
  currentUserId?: string;
  initialPins?: StoryLocationPin[];
  onOpenStory?: (pin: StoryLocationPin) => void;
}

export function SocialMapView({
  currentUserId = 'user-current',
  initialPins = INITIAL_MAP_PINS,
  onOpenStory,
}: SocialMapViewProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(3);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [privacySettings, setPrivacySettings] = useState<Record<string, PrivacyShieldSettings>>({
    [currentUserId]: DEFAULT_PRIVACY_SHIELD,
  });
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [selectedPin, setSelectedPin] = useState<StoryLocationPin | null>(null);
  const [userCenterCity, setUserCenterCity] = useState<string>('All');

  const myPrivacy = privacySettings[currentUserId] ?? DEFAULT_PRIVACY_SHIELD;

  // Filter pins based on privacy shield rules
  const privacyFilteredPins = useMemo(() => {
    return filterPinsByPrivacy(
      initialPins,
      currentUserId,
      privacySettings,
      (targetId) => targetId === 'user-alice' || targetId === 'user-bob',
    );
  }, [initialPins, currentUserId, privacySettings]);

  // Filter pins by search query
  const searchablePins = useMemo(() => {
    if (!searchQuery.trim()) return privacyFilteredPins;
    const q = searchQuery.toLowerCase().trim();
    return privacyFilteredPins.filter(
      (p) =>
        p.cityName.toLowerCase().includes(q) ||
        (p.landmarkName && p.landmarkName.toLowerCase().includes(q)) ||
        p.username.toLowerCase().includes(q) ||
        (p.caption && p.caption.toLowerCase().includes(q)),
    );
  }, [privacyFilteredPins, searchQuery]);

  // Compute story clusters based on zoom
  const clusters = useMemo(() => {
    return computeStoryClusters(searchablePins, zoomLevel);
  }, [searchablePins, zoomLevel]);

  const handleToggleGhostMode = useCallback(() => {
    const updated = updatePrivacyShield(myPrivacy, {
      ghostModeEnabled: !myPrivacy.ghostModeEnabled,
    });
    setPrivacySettings((prev) => ({
      ...prev,
      [currentUserId]: updated,
    }));
  }, [currentUserId, myPrivacy]);

  const handleUpdateSharingScope = useCallback(
    (scope: LocationSharingScope) => {
      const updated = updatePrivacyShield(myPrivacy, {
        ghostModeEnabled: scope === 'ghost',
        sharingScope: scope,
      });
      setPrivacySettings((prev) => ({
        ...prev,
        [currentUserId]: updated,
      }));
    },
    [currentUserId, myPrivacy],
  );

  return (
    <div
      className="relative w-full h-full min-h-[640px] bg-[#090A0C] text-white overflow-hidden flex flex-col font-sans select-none"
      aria-label="Geospatial Social Map"
    >
      {/* Top Floating Glass Bar */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-3 pointer-events-auto">
        <div className="flex-1 max-w-md relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search places, stories, or creators..."
            aria-label="Search map locations"
            className="w-full bg-[#161B22]/80 backdrop-blur-md border border-[#30363D] rounded-full px-4 py-2.5 pl-10 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#FF8C42] transition-colors"
          />
          <span className="absolute left-3.5 top-2.5 text-gray-400 text-sm" aria-hidden="true">
            🔍
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-white text-xs bg-gray-700/60 rounded-full w-5 h-5 flex items-center justify-center"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Privacy Shield Status Button */}
        <button
          type="button"
          onClick={() => setIsPrivacyModalOpen(true)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-md border transition-all shadow-lg ${
            myPrivacy.ghostModeEnabled
              ? 'bg-purple-950/80 border-purple-500/50 text-purple-200 hover:bg-purple-900/80'
              : 'bg-[#161B22]/80 border-[#30363D] text-gray-200 hover:bg-[#21262D]'
          }`}
          aria-label={`Privacy Shield: ${myPrivacy.ghostModeEnabled ? 'Ghost Mode Active' : 'Sharing Location'}`}
        >
          <span className="text-base">{myPrivacy.ghostModeEnabled ? '👻' : '🛡️'}</span>
          <span>{myPrivacy.ghostModeEnabled ? 'Ghost Mode' : 'Sharing'}</span>
        </button>
      </header>

      {/* Map Interactive Viewport Canvas */}
      <main
        className="relative flex-1 w-full h-full bg-[#0D1117] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        aria-label="Interactive Map Area"
      >
        {/* Subtle Map Grid / Landmass Simulation */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#30363D_1px,transparent_1px)] [background-size:24px_24px]" />

        {/* Active Pins & Clusters */}
        <div className="relative w-full h-full max-w-4xl max-h-[600px] flex items-center justify-center">
          {clusters.length === 0 ? (
            <div className="text-center p-6 bg-[#161B22]/90 backdrop-blur-md rounded-2xl border border-[#30363D] max-w-sm">
              <span className="text-4xl mb-3 block">📍</span>
              <h3 className="text-base font-semibold text-white">No Stories Found</h3>
              <p className="text-xs text-gray-400 mt-1">
                {myPrivacy.ghostModeEnabled
                  ? 'Ghost Mode is on or no stories match your current search.'
                  : 'Try zooming out or searching for another city.'}
              </p>
            </div>
          ) : (
            clusters.map((cluster) => {
              const rep = cluster.representativePin;
              const isSelected = selectedPin?.id === rep.id;

              return (
                <motion.div
                  key={cluster.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedPin(rep)}
                  className="cursor-pointer flex flex-col items-center group relative m-6"
                  role="button"
                  tabIndex={0}
                  aria-label={`Story pin in ${cluster.cityName} by ${rep.displayName}, ${cluster.count} stories`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedPin(rep);
                    }
                  }}
                >
                  {/* Pin Bubble */}
                  <div className="relative">
                    {/* Story Gradient Ring */}
                    <div
                      className={`w-14 h-14 rounded-full p-[2px] transition-all duration-300 shadow-xl ${
                        isSelected
                          ? 'ring-4 ring-[#FF8C42] ring-offset-2 ring-offset-[#090A0C]'
                          : 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600'
                      }`}
                    >
                      <img
                        src={rep.mediaThumbnail || rep.avatarUrl}
                        alt={rep.username}
                        className="w-full h-full object-cover rounded-full border-2 border-[#090A0C]"
                      />
                    </div>

                    {/* Cluster Count Badge */}
                    {cluster.count > 1 && (
                      <span className="absolute -top-1 -right-1 bg-[#FF8C42] text-[#090A0C] font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#090A0C] shadow-md">
                        {cluster.count}
                      </span>
                    )}

                    {/* Small Creator Avatar Badge */}
                    <img
                      src={rep.avatarUrl}
                      alt={rep.username}
                      className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full border border-[#090A0C] object-cover"
                    />
                  </div>

                  {/* City Label Tag */}
                  <div className="mt-1.5 px-2 py-0.5 rounded-full bg-[#161B22]/90 border border-[#30363D] text-[11px] font-medium text-gray-200 backdrop-blur-md shadow-md">
                    {cluster.cityName}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Zoom Controls */}
        <div className="absolute right-4 bottom-24 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(z + 1, 6))}
            aria-label="Zoom in"
            className="w-10 h-10 rounded-full bg-[#161B22]/80 backdrop-blur-md border border-[#30363D] text-white hover:bg-[#21262D] flex items-center justify-center font-bold text-lg shadow-lg"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(z - 1, 1))}
            aria-label="Zoom out"
            className="w-10 h-10 rounded-full bg-[#161B22]/80 backdrop-blur-md border border-[#30363D] text-white hover:bg-[#21262D] flex items-center justify-center font-bold text-lg shadow-lg"
          >
            −
          </button>
        </div>
      </main>

      {/* Selected Story Preview Card (Bottom Floating Drawer) */}
      <AnimatePresence>
        {selectedPin && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 z-30 max-w-md mx-auto bg-[#161B22]/95 backdrop-blur-xl border border-[#30363D] rounded-2xl p-4 shadow-2xl flex items-center gap-4"
            aria-label="Selected Story Preview"
          >
            <img
              src={selectedPin.mediaThumbnail}
              alt={selectedPin.caption ?? 'Story thumbnail'}
              className="w-16 h-20 rounded-xl object-cover border border-[#30363D] flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <img
                  src={selectedPin.avatarUrl}
                  alt={selectedPin.username}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span className="text-xs font-semibold text-white truncate">
                  {selectedPin.displayName}
                </span>
                <span className="text-[10px] text-gray-400">@{selectedPin.username}</span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-[#FF8C42] mt-1 font-medium">
                <span>📍</span>
                <span className="truncate">
                  {selectedPin.landmarkName
                    ? `${selectedPin.landmarkName}, ${selectedPin.cityName}`
                    : selectedPin.cityName}
                </span>
              </div>

              {selectedPin.caption && (
                <p className="text-xs text-gray-300 mt-1 line-clamp-1">{selectedPin.caption}</p>
              )}

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onOpenStory?.(selectedPin)}
                  className="px-3 py-1 rounded-lg bg-[#FF8C42] text-[#090A0C] font-semibold text-xs hover:bg-[#e07b36] transition-colors"
                  aria-label={`View story by ${selectedPin.username}`}
                >
                  View Story
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPin(null)}
                  className="px-2 py-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white text-xs transition-colors"
                  aria-label="Close story preview"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy Shield ("Ghost Mode") Modal */}
      <AnimatePresence>
        {isPrivacyModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-2xl relative"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👻</span>
                  <h3 id="privacy-modal-title" className="text-lg font-bold text-white">
                    Ghost Mode & Privacy
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(false)}
                  className="text-gray-400 hover:text-white text-sm p-1"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                When Ghost Mode is enabled, your stories will not share your physical location pin
                on the Social Map.
              </p>

              {/* Ghost Mode Fast Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0D1117] border border-[#30363D] mb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Enable Ghost Mode</span>
                  <span className="text-[10px] text-gray-400">Completely hide your location</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleGhostMode}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    myPrivacy.ghostModeEnabled ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                  aria-label="Toggle ghost mode"
                >
                  <span
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                      myPrivacy.ghostModeEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Sharing Scope Selection */}
              <div className="space-y-2 mb-6">
                <span className="text-xs font-semibold text-gray-300 block mb-2">
                  Who can see your location:
                </span>

                <button
                  type="button"
                  onClick={() => handleUpdateSharingScope('followers')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-colors ${
                    !myPrivacy.ghostModeEnabled && myPrivacy.sharingScope === 'followers'
                      ? 'bg-[#FF8C42]/10 border-[#FF8C42] text-white'
                      : 'bg-[#0D1117] border-[#30363D] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span>👥 All Followers</span>
                  {!myPrivacy.ghostModeEnabled && myPrivacy.sharingScope === 'followers' && (
                    <span className="text-[#FF8C42]">✓</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateSharingScope('close_friends')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-colors ${
                    !myPrivacy.ghostModeEnabled && myPrivacy.sharingScope === 'close_friends'
                      ? 'bg-emerald-500/10 border-emerald-500 text-white'
                      : 'bg-[#0D1117] border-[#30363D] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />⭐ Close Friends Only
                  </span>
                  {!myPrivacy.ghostModeEnabled && myPrivacy.sharingScope === 'close_friends' && (
                    <span className="text-emerald-400">✓</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateSharingScope('ghost')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-colors ${
                    myPrivacy.ghostModeEnabled || myPrivacy.sharingScope === 'ghost'
                      ? 'bg-purple-900/20 border-purple-500 text-purple-200'
                      : 'bg-[#0D1117] border-[#30363D] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span>👻 Ghost Mode (Only Me)</span>
                  {(myPrivacy.ghostModeEnabled || myPrivacy.sharingScope === 'ghost') && (
                    <span className="text-purple-400">✓</span>
                  )}
                </button>
              </div>

              {/* Done Button */}
              <button
                type="button"
                onClick={() => setIsPrivacyModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-[#FF8C42] text-[#090A0C] font-bold text-xs hover:bg-[#e07b36] transition-colors"
              >
                Save Preferences
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
