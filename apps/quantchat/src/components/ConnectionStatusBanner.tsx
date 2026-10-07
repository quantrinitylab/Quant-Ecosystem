'use client';

import React from 'react';
import { useRealtime } from '../providers/realtime-context';

// ============================================================================
// Task 16.6: Degraded-Connectivity Indicator UI
//
// - When connectionState === 'degraded': yellow banner
//   "Connection limited — some features may be delayed"
// - When connectionState === 'reconnecting': subtle pulsing indicator
// ============================================================================

/**
 * ConnectionStatusBanner renders a non-intrusive banner at the top of the
 * viewport when the real-time connection is degraded or reconnecting.
 */
export function ConnectionStatusBanner() {
  const { connectionState } = useRealtime();

  if (connectionState === 'connected' || connectionState === 'disconnected') {
    return null;
  }

  if (connectionState === 'degraded') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-400 px-4 py-2 text-sm font-medium text-yellow-900 shadow-sm"
        style={{
          backgroundColor: '#facc15',
          color: '#713f12',
          fontSize: '0.875rem',
          fontWeight: 500,
          padding: '0.5rem 1rem',
          textAlign: 'center',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        }}
      >
        <DegradedIcon />
        <span>Connection limited — some features may be delayed</span>
      </div>
    );
  }

  if (connectionState === 'reconnecting') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-blue-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm"
        style={{
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '0.375rem 1rem',
          textAlign: 'center',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        }}
      >
        <PulsingDot />
        <span>Reconnecting...</span>
      </div>
    );
  }

  return null;
}

/** Yellow warning icon for degraded state */
function DegradedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 1L1 14h14L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

/** Pulsing dot animation for reconnecting state */
function PulsingDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </span>
  );
}

export default ConnectionStatusBanner;
