'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';

/**
 * QM-SCREEN-005 R2 — honest sender-safety scan for the thread views.
 *
 * The backend owns a real AI phishing detector (`POST
 * /emails/:id/detect-phishing`, auth-gated; see backend/routes/ai.ts and the
 * Next proxy at src/app/api/emails/[id]/detect-phishing/route.ts). The thread
 * views used to never call it — spoofed senders rendered with no warning at
 * all. This hook calls it per inbound message, lazily.
 *
 * Honesty contract (do not weaken):
 * - A failed/denied scan resolves to `unavailable`, NEVER to `clear`. The
 *   banner shows "Safety check unavailable", not an all-clear.
 * - `idle` (never checked) and `loading` are distinct from `clear`.
 * - Clear/warning results are cached per message id for the session; failures
 *   are NOT cached, so a later remount retries honestly.
 * - The AI scan is expensive: concurrent mounts for the same id share one
 *   request, and at most MAX_CONCURRENT scans run at once.
 */
export type PhishingCheckStatus = 'idle' | 'loading' | 'clear' | 'warning' | 'unavailable';

export interface PhishingCheckResult {
  status: PhishingCheckStatus;
  isPhishing: boolean;
  /** 0–100 when the backend reports one, else 0. */
  confidence: number;
  /** Human-readable detector notes from the backend (may be empty). */
  indicators: string[];
  /** Backend error code when the scan failed, e.g. UNAUTHORIZED. */
  errorCode?: string;
}

const IDLE_RESULT: PhishingCheckResult = {
  status: 'idle',
  isPhishing: false,
  confidence: 0,
  indicators: [],
};

/** Session cache of completed scans: one AI call per message id. */
const resultCache = new Map<string, PhishingCheckResult>();
/** In-flight dedup: concurrent mounts for the same id share one request. */
const inFlight = new Map<string, Promise<PhishingCheckResult>>();
const MAX_CONCURRENT_SCANS = 3;
let activeScans = 0;
const waitQueue: Array<() => void> = [];

function acquireScanSlot(): Promise<void> {
  if (activeScans < MAX_CONCURRENT_SCANS) {
    activeScans += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeScans += 1;
      resolve();
    });
  });
}

function releaseScanSlot(): void {
  activeScans = Math.max(0, activeScans - 1);
  const next = waitQueue.shift();
  if (next) next();
}

async function runScan(emailId: string): Promise<PhishingCheckResult> {
  const cached = resultCache.get(emailId);
  if (cached) return cached;
  const pending = inFlight.get(emailId);
  if (pending) return pending;

  const promise = (async (): Promise<PhishingCheckResult> => {
    await acquireScanSlot();
    try {
      const res = await apiClient.detectPhishing(emailId);
      const data = res?.data;
      if (!res?.success || !data) {
        // Failed scan: unavailable, never an all-clear.
        return {
          status: 'unavailable',
          isPhishing: false,
          confidence: 0,
          indicators: [],
          errorCode: res?.error?.code ?? 'CHECK_FAILED',
        };
      }
      const result: PhishingCheckResult = {
        status: data.isPhishing ? 'warning' : 'clear',
        isPhishing: Boolean(data.isPhishing),
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        indicators: Array.isArray(data.indicators) ? data.indicators : [],
      };
      resultCache.set(emailId, result);
      return result;
    } catch {
      // Network/transport failure: unavailable, never an all-clear.
      return {
        status: 'unavailable',
        isPhishing: false,
        confidence: 0,
        indicators: [],
        errorCode: 'CHECK_FAILED',
      };
    } finally {
      releaseScanSlot();
      inFlight.delete(emailId);
    }
  })();

  inFlight.set(emailId, promise);
  return promise;
}

/**
 * Run (or reuse) the phishing scan for one message.
 *
 * `enabled` is the caller saying "this message is worth scanning" — the
 * thread views pass false for outbound messages (you wrote them; scanning
 * your own sends would be noise) and for messages without an id. Disabled
 * returns `idle` and fires no request.
 */
export function usePhishingCheck(
  emailId: string | undefined,
  options: { enabled: boolean },
): PhishingCheckResult {
  const { enabled } = options;
  const [result, setResult] = useState<PhishingCheckResult>(() => {
    if (!emailId || !enabled) return IDLE_RESULT;
    const cached = resultCache.get(emailId);
    return cached ?? { ...IDLE_RESULT, status: 'loading' as const };
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!emailId || !enabled) {
      setResult(IDLE_RESULT);
      return;
    }
    const cached = resultCache.get(emailId);
    if (cached) {
      setResult(cached);
      return;
    }
    let cancelled = false;
    setResult({ ...IDLE_RESULT, status: 'loading' });
    runScan(emailId).then((scanned) => {
      if (!cancelled && mountedRef.current) setResult(scanned);
    });
    return () => {
      cancelled = true;
    };
  }, [emailId, enabled]);

  return result;
}

/** Test seam: reset module-level scan state between tests. */
export function __resetPhishingCheckCacheForTests(): void {
  resultCache.clear();
  inFlight.clear();
  activeScans = 0;
  waitQueue.length = 0;
}
