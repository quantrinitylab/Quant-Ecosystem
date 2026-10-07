'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================================
// Task 8.7: HeatmapOverlay — Activity density visualization for Explore tab
// Renders colored circles (opacity proportional to activity count) at positions.
// Data comes from backend endpoint /api/map/heatmap.
// CSS gradient blobs rendering.
//
// Starts empty and is filled only with real backend data. When the API is
// unavailable nothing is rendered — invented activity is never shown.
// ============================================================================

export interface HeatmapPoint {
  id: string;
  latitude: number;
  longitude: number;
  activityCount: number;
  /** Position expressed as % for map display */
  top: string;
  left: string;
}

interface HeatmapOverlayProps {
  visible: boolean;
}

/** Map activity count (0-100) to a size class and opacity */
function getHeatmapStyle(activityCount: number) {
  // Normalize to 0-1
  const intensity = Math.min(activityCount / 100, 1);
  const size = 60 + intensity * 120; // 60px to 180px
  const opacity = 0.15 + intensity * 0.45; // 0.15 to 0.6

  return { size, opacity };
}

/** Choose color based on intensity */
function getHeatmapColor(activityCount: number): string {
  if (activityCount > 75) return 'from-red-500 to-orange-500';
  if (activityCount > 50) return 'from-orange-500 to-yellow-500';
  if (activityCount > 25) return 'from-yellow-500 to-green-500';
  return 'from-green-500 to-teal-500';
}

export function HeatmapOverlay({ visible }: HeatmapOverlayProps) {
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);

  // Fetch heatmap data from API
  useEffect(() => {
    if (!visible) return;

    fetch('/api/map/heatmap')
      .then((r) => r.json())
      .then((json) => {
        const data = json.data || json.heatmap || json;
        if (Array.isArray(data) && data.length > 0) {
          setHeatmapData(data);
        }
      })
      .catch(() => {
        // Leave the overlay empty — no invented activity.
      });
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {heatmapData.map((point, idx) => {
        const { size, opacity } = getHeatmapStyle(point.activityCount);
        const colorGradient = getHeatmapColor(point.activityCount);

        return (
          <motion.div
            key={point.id}
            className={`absolute rounded-full bg-gradient-radial ${colorGradient} blur-xl pointer-events-none`}
            style={{
              top: point.top,
              left: point.left,
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${
                point.activityCount > 75
                  ? 'rgba(239,68,68,0.6)'
                  : point.activityCount > 50
                    ? 'rgba(245,158,11,0.5)'
                    : point.activityCount > 25
                      ? 'rgba(234,179,8,0.4)'
                      : 'rgba(16,185,129,0.3)'
              } 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity, scale: 1 }}
            transition={{ duration: 0.4, delay: idx * 0.05 }}
          />
        );
      })}
    </>
  );
}

export default HeatmapOverlay;
