// prettier-ignore
export interface UsageSession { id: string; appId: string; startedAt: number; endedAt: number | null; isBinge: boolean }
// prettier-ignore
export interface DoomScrollSignal { id: string; appId: string; scrollCount: number; durationMs: number; triggeredAt: number }
// prettier-ignore
export interface BedtimeConfig { enabled: boolean; startHour: number; endHour: number; dimLevel: number; blockNonEssential: boolean }
// prettier-ignore
export interface WellbeingReport { period: 'daily' | 'weekly'; totalMinutes: number; bingeCount: number; doomScrollAlerts: number; appBreakdown: Record<string, number> }
