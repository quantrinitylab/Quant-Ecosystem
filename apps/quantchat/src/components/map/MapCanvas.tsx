'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

// ============================================================================
// Task 8.1: MapCanvas — div-based map container with geolocation centering,
// pulsing blue dot for user location, and gesture support (8.8)
// Task 8.9: Geolocation-denied fallback
// ============================================================================

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface MapCanvasProps {
  children?: React.ReactNode;
  /** Called when user location is acquired */
  onLocationAcquired?: (position: GeoPosition) => void;
  /** Called when geolocation is denied */
  onLocationDenied?: () => void;
  /** External zoom level override */
  zoomLevel?: number;
  /** External pan offset override */
  panOffset?: { x: number; y: number };
}

/** Default fallback location (New York City center) */
const DEFAULT_LOCATION: GeoPosition = {
  latitude: 40.7128,
  longitude: -74.006,
  accuracy: 0,
  timestamp: Date.now(),
};

export function MapCanvas({
  children,
  onLocationAcquired,
  onLocationDenied,
  zoomLevel: externalZoom,
  panOffset: externalPan,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // Gesture state for pinch-to-zoom and pan (Task 8.8)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const lastDistRef = useRef(0);

  // Framer Motion spring values for smooth zoom transitions
  const springZoom = useSpring(1, { stiffness: 300, damping: 30, mass: 0.8 });
  const springX = useSpring(0, { stiffness: 300, damping: 30, mass: 0.8 });
  const springY = useSpring(0, { stiffness: 300, damping: 30, mass: 0.8 });

  // Sync external overrides
  useEffect(() => {
    if (externalZoom !== undefined) {
      setZoom(externalZoom);
      springZoom.set(externalZoom);
    }
  }, [externalZoom, springZoom]);

  useEffect(() => {
    if (externalPan) {
      setPan(externalPan);
      springX.set(externalPan.x);
      springY.set(externalPan.y);
    }
  }, [externalPan, springX, springY]);

  // Task 8.1 & 8.9: Get user geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      setUserLocation(DEFAULT_LOCATION);
      onLocationDenied?.();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geoPos: GeoPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setUserLocation(geoPos);
        onLocationAcquired?.(geoPos);
      },
      (error) => {
        // Task 8.9: If PermissionDeniedError, use default location
        if (error.code === error.PERMISSION_DENIED) {
          setLocationDenied(true);
          setUserLocation(DEFAULT_LOCATION);
          onLocationDenied?.();
        } else {
          // Other errors (position unavailable, timeout): use fallback
          setUserLocation(DEFAULT_LOCATION);
          onLocationDenied?.();
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, [onLocationAcquired, onLocationDenied]);

  // Task 8.8: Pointer events for pan gestures
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsPanning(true);
      lastPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const newX = e.clientX - lastPanRef.current.x;
      const newY = e.clientY - lastPanRef.current.y;
      setPan({ x: newX, y: newY });
      springX.set(newX);
      springY.set(newY);
    },
    [isPanning, springX, springY],
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Task 8.8: Wheel/pinch zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.5, Math.min(4, zoom + delta));
      setZoom(newZoom);
      springZoom.set(newZoom);
    },
    [zoom, springZoom],
  );

  // Touch gesture handling for pinch-to-zoom
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (lastDistRef.current > 0) {
          const scale = dist / lastDistRef.current;
          const newZoom = Math.max(0.5, Math.min(4, zoom * scale));
          setZoom(newZoom);
          springZoom.set(newZoom);
        }
        lastDistRef.current = dist;
      }
    },
    [zoom, springZoom],
  );

  const handleTouchEnd = useCallback(() => {
    lastDistRef.current = 0;
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Map tile background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-teal-800 to-slate-900"
        style={{
          scale: springZoom,
          x: springX,
          y: springY,
        }}
      >
        {/* Grid overlay simulating map tiles */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute left-0 right-0 border-t border-white/50"
              style={{ top: `${(i + 1) * 5}%` }}
            />
          ))}
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute top-0 bottom-0 border-l border-white/50"
              style={{ left: `${(i + 1) * 5}%` }}
            />
          ))}
        </div>

        {/* Road-like shapes for realism */}
        <div className="absolute top-0 bottom-0 left-[48%] w-[4%] bg-gray-600/20" />
        <div className="absolute left-0 right-0 top-[45%] h-[3%] bg-gray-600/20" />
        <div className="absolute top-[20%] bottom-[30%] left-[25%] w-[2%] bg-gray-700/15 rotate-12" />
        <div className="absolute left-[10%] right-[30%] top-[70%] h-[2%] bg-gray-700/15 -rotate-6" />

        {/* User location pulsing blue dot (Task 8.1) */}
        {userLocation && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
            {/* Pulsing ring */}
            <div className="absolute -inset-3 rounded-full bg-blue-500/30 animate-ping" />
            {/* Outer glow */}
            <div className="absolute -inset-2 rounded-full bg-blue-400/20 animate-pulse" />
            {/* Blue dot */}
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/50" />
          </div>
        )}

        {/* Children (friend pins, overlays) are rendered inside the map transform */}
        {children}
      </motion.div>

      {/* Task 8.9: Location denied banner */}
      {locationDenied && (
        <div className="absolute top-28 left-4 right-4 z-50">
          <div className="bg-yellow-500/90 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <span className="text-lg">&#9888;&#65039;</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">
                Enable location to see friends nearby
              </p>
            </div>
            <a
              href="https://support.google.com/chrome/answer/142065"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-yellow-900 underline whitespace-nowrap"
            >
              Learn how
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapCanvas;
