/**
 * calendar-trackers-storage.ts
 *
 * Persistence for CalendarTrackersSubView's water log + custom life trackers.
 *
 * There is NO backend endpoint for these (verified in backend/routes/calendar.ts:
 * calendars/events/booking-links only — nothing for water, habits or life
 * trackers). So these persist in localStorage, per user, date-scoped for the
 * water log (a hydration counter that carries yesterday's total into today
 * would be dishonest).
 *
 * Contract for the UI: a "Logged" / "Tracker added" success toast may ONLY be
 * shown after the corresponding save*() call returned true. When storage is
 * unavailable (private mode, quota, SSR), the callers must surface an honest
 * error toast instead of claiming a log was recorded.
 */

export interface StoredLifeTracker {
  id: string;
  title: string;
  category: string;
  targetDate: string;
  notes: string;
  tone: string;
}

const VALID_CATEGORIES = ['Countdown', 'Recurring Cycle', 'Medical / Health', 'Legal / Documents'];
const VALID_TONES = ['rose', 'emerald', 'amber', 'sky'];

/** Minimal surface of Storage we rely on — lets tests inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The real localStorage, or null when there is none (SSR) or access throws
 * (private browsing, quota). Callers treat null as "cannot persist".
 */
export function safeStorage(): StorageLike | null {
  try {
    const s = (globalThis as unknown as { localStorage?: StorageLike }).localStorage;
    if (!s) return null;
    // Touch it once so a throwing proxy (locked-down private mode) fails fast.
    s.getItem('__quant_storage_probe__');
    return s;
  } catch {
    return null;
  }
}

/** Local 'YYYY-MM-DD' day key — the water counter resets with the day. */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Per-user keys so two accounts on one browser don't see each other's logs. */
export function waterLogKey(userId: string): string {
  return `quant_calendar_water_log:${userId || 'anon'}`;
}

export function lifeTrackersKey(userId: string): string {
  return `quant_calendar_life_trackers:${userId || 'anon'}`;
}

function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

interface WaterLogRecord {
  date: string;
  ml: number;
}

/**
 * Today's logged water in ml. Returns 0 when nothing was stored for today —
 * yesterday's total never carries over.
 */
export function loadWaterMl(storage: StorageLike | null, key: string, today: string): number {
  const parsed = readJson(storage, key) as WaterLogRecord | undefined;
  if (!parsed || typeof parsed !== 'object') return 0;
  if (parsed.date !== today) return 0;
  if (typeof parsed.ml !== 'number' || !Number.isFinite(parsed.ml) || parsed.ml < 0) return 0;
  return Math.floor(parsed.ml);
}

/**
 * Persists today's water total. Returns true only when the write landed —
 * the UI must toast success only on true.
 */
export function saveWaterMl(storage: StorageLike | null, key: string, today: string, ml: number): boolean {
  if (!Number.isFinite(ml) || ml < 0) return false;
  return writeJson(storage, key, { date: today, ml: Math.floor(ml) });
}

function isValidTracker(item: unknown): item is StoredLifeTracker {
  if (!item || typeof item !== 'object') return false;
  const t = item as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    typeof t.title === 'string' &&
    t.title.length > 0 &&
    typeof t.targetDate === 'string' &&
    t.targetDate.length > 0
  );
}

function normalizeTracker(item: StoredLifeTracker): StoredLifeTracker {
  return {
    id: item.id,
    title: item.title,
    category: VALID_CATEGORIES.includes(item.category) ? item.category : 'Countdown',
    targetDate: item.targetDate,
    notes: typeof item.notes === 'string' ? item.notes : '',
    tone: VALID_TONES.includes(item.tone) ? item.tone : 'sky',
  };
}

/**
 * Loads the user's custom life trackers. Corrupt entries are dropped, never
 * shown as real data; corrupt payloads degrade to [].
 */
export function loadLifeTrackers(storage: StorageLike | null, key: string): StoredLifeTracker[] {
  const parsed = readJson(storage, key);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidTracker).map(normalizeTracker);
}

/**
 * Persists the trackers list. Returns true only when the write landed —
 * the UI must toast success only on true.
 */
export function saveLifeTrackers(storage: StorageLike | null, key: string, trackers: StoredLifeTracker[]): boolean {
  if (!Array.isArray(trackers)) return false;
  return writeJson(storage, key, trackers.map(normalizeTracker));
}
