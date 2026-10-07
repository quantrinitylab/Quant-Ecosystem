// ============================================================================
// QuantTube - useLiveStream Hook
// Live stream state (chat, donations, viewers, go live)
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

interface StreamConfig {
  title: string;
  description: string;
  category: string;
  tags: string[];
  visibility: 'public' | 'unlisted' | 'private';
  chatEnabled: boolean;
  donationsEnabled: boolean;
  slowMode: boolean;
  slowModeDelay: number;
  ageRestricted: boolean;
}

interface StreamStats {
  viewerCount: number;
  peakViewers: number;
  totalViews: number;
  chatMessages: number;
  donationsTotal: number;
  donationsCount: number;
  duration: number;
  likes: number;
  shares: number;
}

interface StreamHealth {
  bitrate: number;
  fps: number;
  resolution: string;
  dropFrames: number;
  latency: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
}

interface Donation {
  id: string;
  from: string;
  amount: number;
  currency: string;
  message: string;
  timestamp: string;
}

type StreamStatus = 'offline' | 'connecting' | 'live' | 'ending' | 'error';

interface LiveStreamState {
  status: StreamStatus;
  config: StreamConfig;
  stats: StreamStats;
  health: StreamHealth;
  streamKey: string;
  rtmpUrl: string;
  donations: Donation[];
  startedAt: string | null;
  error: string | null;
  loading: boolean;
  raidTarget: string | null;
  clipCreating: boolean;
}

interface LiveStreamActions {
  goLive: () => Promise<void>;
  endStream: () => void;
  updateConfig: (updates: Partial<StreamConfig>) => void;
  toggleChat: () => void;
  toggleDonations: () => void;
  toggleSlowMode: () => void;
  setSlowModeDelay: (seconds: number) => void;
  raidChannel: (channelId: string) => void;
  cancelRaid: () => void;
  createClip: () => Promise<string | null>;
  regenerateStreamKey: () => void;
  acknowledgeDonation: (donationId: string) => void;
}

const INITIAL_CONFIG: StreamConfig = {
  title: '',
  description: '',
  category: 'Gaming',
  tags: [],
  visibility: 'public',
  chatEnabled: true,
  donationsEnabled: true,
  slowMode: false,
  slowModeDelay: 5,
  ageRestricted: false,
};

const INITIAL_STATS: StreamStats = {
  viewerCount: 0,
  peakViewers: 0,
  totalViews: 0,
  chatMessages: 0,
  donationsTotal: 0,
  donationsCount: 0,
  duration: 0,
  likes: 0,
  shares: 0,
};

const INITIAL_HEALTH: StreamHealth = {
  bitrate: 0,
  fps: 0,
  resolution: '0x0',
  dropFrames: 0,
  latency: 0,
  status: 'excellent',
};

/** Monotonic fallback counter used only when Web Crypto is unavailable. */
let streamKeyFallbackCounter = 0;

/**
 * Generate a client-side preview stream key. Uses the Web Crypto RNG
 * (`crypto.randomUUID`) so the key is not predictable, and falls back to a
 * timestamp + counter only when Web Crypto is unavailable (e.g. an insecure
 * context). It never uses `Math.random`.
 */
function generateStreamKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  streamKeyFallbackCounter += 1;
  return `sk_live_${Date.now().toString(36)}${streamKeyFallbackCounter.toString(36)}`;
}

export function useLiveStream(): [LiveStreamState, LiveStreamActions] {
  const [state, setState] = useState<LiveStreamState>({
    status: 'offline',
    config: INITIAL_CONFIG,
    stats: INITIAL_STATS,
    health: INITIAL_HEALTH,
    streamKey: generateStreamKey(),
    rtmpUrl: 'rtmp://stream.quantube.app/live',
    donations: [],
    startedAt: null,
    error: null,
    loading: false,
    raidTarget: null,
    clipCreating: false,
  });

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.status === 'live') {
      // Duration counts up from when this client went live — real local time,
      // not a fabricated viewer/metric feed. Viewer counts and stream health
      // are only shown when a real metrics source provides them.
      durationTimerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          stats: { ...prev.stats, duration: prev.stats.duration + 1 },
        }));
      }, 1000);

      return () => {
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      };
    }
  }, [state.status]);

  const goLive = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'connecting', loading: true, error: null }));
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Metrics stay at zero until a real metrics source provides values —
    // viewer counts and stream health are never simulated.
    setState((prev) => ({
      ...prev,
      status: 'live',
      loading: false,
      startedAt: new Date().toISOString(),
      stats: { ...INITIAL_STATS },
      health: { ...INITIAL_HEALTH },
    }));
  }, []);

  const endStream = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'ending' }));
    setTimeout(() => {
      setState((prev) => ({ ...prev, status: 'offline' }));
    }, 1000);
  }, []);

  const updateConfig = useCallback((updates: Partial<StreamConfig>) => {
    setState((prev) => ({ ...prev, config: { ...prev.config, ...updates } }));
  }, []);

  const toggleChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, chatEnabled: !prev.config.chatEnabled },
    }));
  }, []);

  const toggleDonations = useCallback(() => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, donationsEnabled: !prev.config.donationsEnabled },
    }));
  }, []);

  const toggleSlowMode = useCallback(() => {
    setState((prev) => ({ ...prev, config: { ...prev.config, slowMode: !prev.config.slowMode } }));
  }, []);

  const setSlowModeDelay = useCallback((seconds: number) => {
    setState((prev) => ({ ...prev, config: { ...prev.config, slowModeDelay: seconds } }));
  }, []);

  const raidChannel = useCallback((channelId: string) => {
    setState((prev) => ({ ...prev, raidTarget: channelId }));
    setTimeout(() => {
      setState((prev) => ({ ...prev, raidTarget: null, status: 'offline' }));
    }, 10000);
  }, []);

  const cancelRaid = useCallback(() => {
    setState((prev) => ({ ...prev, raidTarget: null }));
  }, []);

  const createClip = useCallback(async (): Promise<string | null> => {
    setState((prev) => ({ ...prev, clipCreating: true }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const clipId = 'clip_' + Math.random().toString(36).substring(2, 10);
    setState((prev) => ({ ...prev, clipCreating: false }));
    return clipId;
  }, []);

  const regenerateStreamKey = useCallback(() => {
    setState((prev) => ({
      ...prev,
      streamKey: generateStreamKey(),
    }));
  }, []);

  const acknowledgeDonation = useCallback((donationId: string) => {
    setState((prev) => ({
      ...prev,
      donations: prev.donations.filter((d) => d.id !== donationId),
    }));
  }, []);

  const actions: LiveStreamActions = {
    goLive,
    endStream,
    updateConfig,
    toggleChat,
    toggleDonations,
    toggleSlowMode,
    setSlowModeDelay,
    raidChannel,
    cancelRaid,
    createClip,
    regenerateStreamKey,
    acknowledgeDonation,
  };

  return [state, actions];
}

export default useLiveStream;
