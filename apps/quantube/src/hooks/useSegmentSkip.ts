// ============================================================================
// QuantTube — useSegmentSkip hook
// ============================================================================
//
// Fetches a video's server-computed skip-plan and resolves "teach me X" topic
// jumps, exposing them to the watch page which applies the seek targets to the
// real <video>.currentTime handle. Pure seek math lives in ../lib/segment-skip.

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';
import { nextSkipTarget, type SkipPlan, type TopicJump } from '../lib/segment-skip';

export interface UseSegmentSkip {
  /** The server-computed skip-plan (null until a positive duration is known). */
  skipPlan: SkipPlan | null;
  /** Latest resolved "teach me X" jump targets. */
  topicJumps: TopicJump[];
  /** Fetch topic jumps for a query; also stores them in `topicJumps`. */
  fetchTopicJumps: (query: string) => Promise<TopicJump[]>;
  /** Clear the current topic-jump results. */
  clearTopicJumps: () => void;
  /**
   * The second to seek to in order to skip the segment at `currentTime`, or
   * null if the playhead is in playable content. Bound to the current plan.
   */
  skipTargetAt: (currentTime: number) => number | null;
}

export function useSegmentSkip(videoId: string, durationSec: number): UseSegmentSkip {
  const [skipPlan, setSkipPlan] = useState<SkipPlan | null>(null);
  const [topicJumps, setTopicJumps] = useState<TopicJump[]>([]);

  useEffect(() => {
    if (!videoId || !Number.isFinite(durationSec) || durationSec <= 0) {
      return;
    }
    let cancelled = false;
    void apiClient
      .getSkipPlan(videoId, { duration: Math.round(durationSec) })
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setSkipPlan(res.data);
        }
      })
      .catch(() => {
        /* skip-plan is a progressive enhancement; ignore fetch failures */
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, durationSec]);

  const fetchTopicJumps = useCallback(
    async (query: string): Promise<TopicJump[]> => {
      if (!videoId || !query.trim()) {
        setTopicJumps([]);
        return [];
      }
      try {
        const res = await apiClient.getTopicJumps(videoId, { q: query.trim() });
        const jumps = res.success && res.data ? res.data : [];
        setTopicJumps(jumps);
        return jumps;
      } catch {
        setTopicJumps([]);
        return [];
      }
    },
    [videoId],
  );

  const clearTopicJumps = useCallback(() => setTopicJumps([]), []);

  const skipTargetAt = useCallback(
    (currentTime: number): number | null =>
      skipPlan ? nextSkipTarget(skipPlan.skipRanges, currentTime) : null,
    [skipPlan],
  );

  return { skipPlan, topicJumps, fetchTopicJumps, clearTopicJumps, skipTargetAt };
}

export default useSegmentSkip;
