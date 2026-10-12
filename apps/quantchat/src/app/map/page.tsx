'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { BottomNav } from '@quant/shared-ui';
import { chatSocket } from '../../services/chat-socket';
import { MapCanvas } from '../../components/map/MapCanvas';
import { FriendPin } from '../../components/map/FriendPin';
import { GhostModeToggle } from '../../components/map/GhostModeToggle';
import { HeatmapOverlay } from '../../components/map/HeatmapOverlay';
import { navItems, routes } from '../../lib/navigation';
import { shouldBroadcastLocation } from './locationBroadcast';
import { publishLocation, clearSharedLocation } from './locationShare';
import { applyFriendLocationUpdate, type FriendLocationUpdate } from './friendLocationUpdate';
import type { GeoPosition, FriendLocation } from '../../components/map';
import { apiFetchRaw } from '@quant/api-client';

// ============================================================================
// Task 8.1: Map page — MapCanvas + GhostModeToggle header + FriendPins
//           + HeatmapOverlay (Explore tab). Tab switching Friends/Explore.
// Task 8.6: Location broadcast every 30s when ghost mode is OFF
// Task 8.8: Zoom/pan gestures (delegated to MapCanvas)
// Task 8.9: Geolocation-denied fallback (delegated to MapCanvas)
// ============================================================================

/** Convert lng/lat offsets from the user's real center into percentage positions.
 *  Returns null when the user's own location is unknown — pins are never
 *  placed at invented positions. */
function positionToPercent(
  friendPos: [number, number],
  userPos: GeoPosition | null,
): { top: string; left: string } | null {
  if (!userPos) {
    return null;
  }

  // Simple linear mapping: each 0.01 degree ≈ ~1km
  // Map to viewport: center is 50%, scale factor for visibility
  const scaleFactor = 800; // Pixels per degree
  const dx = (friendPos[0] - userPos.longitude) * scaleFactor;
  const dy = -(friendPos[1] - userPos.latitude) * scaleFactor; // Invert Y

  const left = Math.max(5, Math.min(90, 50 + dx));
  const top = Math.max(10, Math.min(85, 50 + dy));

  return { top: `${top}%`, left: `${left}%` };
}

/** Shape returned by GET /api/map/friends (proxied from the backend). */
interface FriendsOnMapResponse {
  success?: boolean;
  data?: {
    friends?: Array<{
      userId: string;
      username?: string;
      avatarUrl?: string | null;
      latitude: number;
      longitude: number;
      updatedAt?: string;
    }>;
  };
}

export default function MapPage() {
  const router = useRouter();

  // Transport note (QM-UIUX-060 + QC-F-056): friend positions are read from
  // the real REST endpoint (GET /api/map/friends, refetched every 30s), and
  // my own location is published through the real REST endpoint too
  // (POST /api/map/location; DELETE when Ghost Mode turns on). The earlier
  // WebSocket `location-update` / `ghost-mode-*` frames went to a backend
  // handler with no map channel and were silently dropped — nothing was
  // ever stored, and ghost mode never removed the server row.

  const [activeTab, setActiveTab] = useState<'friends' | 'explore'>('friends');
  const [ghostMode, setGhostMode] = useState(false);
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  // Starts empty and is filled only with real backend data. No demo or
  // fallback friends: with nothing shared, the map shows an honest empty state.
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  const broadcastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch the caller's close friends who are currently sharing their location
  // from the real backend (GET /api/map/friends → Fastify GET /map/friends).
  const loadFriends = useCallback(async (isCancelled: () => boolean) => {
    try {
      const res = await apiFetchRaw('/api/map/friends');
      const json = res.ok ? ((await res.json()) as FriendsOnMapResponse) : null;
      if (isCancelled() || !json?.success) return;
      const list = Array.isArray(json.data?.friends) ? json.data.friends : [];
      setFriends(
        list.map((f) => ({
          userId: String(f.userId),
          username: f.username ?? '',
          avatarUrl: f.avatarUrl ?? '',
          position: [Number(f.longitude), Number(f.latitude)] as [number, number],
          lastUpdated: f.updatedAt ? new Date(f.updatedAt) : new Date(),
          // The backend does not expose presence for map friends, and the
          // map has no presence source — so this starts false rather than
          // inventing an online state.
          isOnline: false,
        })),
      );
    } catch {
      // Leave the list as-is: the empty state below is honest about that.
    } finally {
      if (!isCancelled()) setFriendsLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void loadFriends(isCancelled);
    // Refetch on the broadcast cadence so friend pins track the real backend
    // state even though the socket has no map channel (see publish note).
    const refetchInterval = setInterval(() => {
      void loadFriends(isCancelled);
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(refetchInterval);
    };
  }, [loadFriends]);

  // Handle location acquired from MapCanvas
  const handleLocationAcquired = useCallback((pos: GeoPosition) => {
    setUserLocation(pos);
  }, []);

  const handleLocationDenied = useCallback(() => {
    setLocationDenied(true);
  }, []);

  // ─── Task 8.2: Subscribe to friend location updates via WebSocket ─────
  // Over the shared chatSocket singleton (QM-UIUX-060). Normalized events
  // carry their payload in `data`; legacy passthrough frames use `payload`.
  // Honest note: the backend does not emit `friend-location-update` frames
  // today, so in practice pins refresh via the 30s REST refetch above; this
  // subscription only applies an update if a real frame ever arrives.
  useEffect(() => {
    chatSocket.acquire();

    const unsubscribeMessage = chatSocket.onMessage((event: any) => {
      if (event?.type !== 'friend-location-update') return;
      const update = (event?.data ?? event?.payload) as FriendLocationUpdate | undefined;
      if (!update?.userId || !Array.isArray(update.position)) return;
      setFriends((prev) => applyFriendLocationUpdate(prev, update));
    });

    return () => {
      unsubscribeMessage();
      chatSocket.release();
    };
  }, []);

  // ─── Task 8.6: Location broadcast every 30s when ghost mode is OFF ────
  // QC-F-056: the broadcast is a real REST publish (POST /api/map/location),
  // not a WebSocket frame — the backend stores it as the caller's
  // FriendLocation row, which is what close friends' maps actually read.
  useEffect(() => {
    // Clear any existing interval
    if (broadcastIntervalRef.current) {
      clearInterval(broadcastIntervalRef.current);
      broadcastIntervalRef.current = null;
    }

    if (!shouldBroadcastLocation(ghostMode)) {
      // Ghost mode ON: never broadcast. The server row itself is removed by
      // the toggle handler (DELETE /api/map/location), so there is nothing
      // left for friends to see.
      return;
    }

    // Start broadcasting location every 30s
    const broadcastLocation = () => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void publishLocation(apiFetchRaw, pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Silently fail — location not available
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 },
      );
    };

    // Broadcast immediately once
    broadcastLocation();

    // Then every 30 seconds
    broadcastIntervalRef.current = setInterval(broadcastLocation, 30000);

    return () => {
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current);
        broadcastIntervalRef.current = null;
      }
    };
  }, [ghostMode]);

  // ─── Task 8.5: Ghost mode toggle handler ──────────────────────────────
  const handleGhostModeToggle = useCallback((enabled: boolean) => {
    setGhostMode(enabled);

    if (enabled) {
      // Clear broadcast interval immediately (Task 8.6)
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current);
        broadcastIntervalRef.current = null;
      }
      // QC-F-056: actually stop sharing server-side — DELETE removes the
      // caller's FriendLocation row, so the pin disappears for close
      // friends instead of only hiding in this client's local state.
      void clearSharedLocation(apiFetchRaw);
    }
    // Disable ghost mode → the broadcast effect resumes publishing.
  }, []);

  // ─── Task 8.3: Navigate to chat on "Open Chat" tap ────────────────────
  const handleOpenChat = useCallback(
    (conversationId: string) => {
      router.push(`/chat/${conversationId}`);
    },
    [router],
  );

  return (
    <motion.div
      className="relative h-dvh w-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {/* Map canvas with gestures, user location dot, and geolocation fallback */}
      <MapCanvas
        onLocationAcquired={handleLocationAcquired}
        onLocationDenied={handleLocationDenied}
      >
        {/* Friend pins (Friends tab) — rendered only from real backend data and
            only once the user's own location is known, so pins are never
            placed at invented positions. */}
        {activeTab === 'friends' &&
          userLocation &&
          friends.map((friend) => {
            const pos = positionToPercent(friend.position, userLocation);
            if (!pos) return null;
            return (
              <FriendPin
                key={friend.userId}
                friend={friend}
                top={pos.top}
                left={pos.left}
                onOpenChat={handleOpenChat}
              />
            );
          })}

        {/* Honest empty state: no close friends are sharing their location. */}
        {activeTab === 'friends' && friendsLoaded && friends.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-[var(--quant-card)]/90 backdrop-blur-md rounded-xl px-6 py-5 mx-8 text-center shadow-lg border border-[var(--quant-border)]">
              <p className="text-[var(--quant-foreground)] text-sm font-medium">
                No shared locations
              </p>
              <p className="text-[var(--quant-muted-foreground)] text-xs mt-1">
                When your close friends share their location, they will appear
                here.
              </p>
            </div>
          </div>
        )}

        {/* Heatmap overlay (Explore tab) — Task 8.7 */}
        <HeatmapOverlay visible={activeTab === 'explore'} />
      </MapCanvas>

      {/* Search bar + Ghost mode toggle header */}
      <div className="absolute top-4 left-4 right-4 z-30">
        <div className="bg-[var(--quant-card)]/90 backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg border border-[var(--quant-border)]">
          <span className="text-[var(--quant-muted-foreground)]">&#128270;</span>
          <input
            type="text"
            placeholder="Search locations..."
            className="flex-1 bg-transparent text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] text-sm outline-none"
          />
          {/* Task 8.5: Ghost mode toggle in header */}
          <GhostModeToggle enabled={ghostMode} onToggle={handleGhostModeToggle} />
        </div>
      </div>

      {/* Tab bar: Friends / Explore */}
      <div className="absolute top-20 left-4 right-4 z-30">
        <div className="flex bg-black/40 backdrop-blur-sm rounded-full p-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] flex items-center justify-center ${
              activeTab === 'friends'
                ? 'bg-emerald-500 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Friends
          </button>
          <button
            onClick={() => setActiveTab('explore')}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] flex items-center justify-center ${
              activeTab === 'explore'
                ? 'bg-emerald-500 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Explore
          </button>
        </div>
      </div>

      {/* My Location re-center button */}
      <div className="absolute bottom-24 right-4 z-30">
        <button
          className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center text-lg border border-[var(--quant-border)]"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setUserLocation({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp,
                  });
                },
                () => {},
              );
            }
          }}
          aria-label="Center on my location"
        >
          &#128205;
        </button>
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 z-30">
        <BottomNav
          items={navItems}
          activeId="map"
          onChange={(id) => {
            const route = routes[id];
            if (route) router.push(route);
          }}
        />
      </div>
    </motion.div>
  );
}
