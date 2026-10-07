// prettier-ignore
export interface UsageSession { id: string; appId: string; startedAt: number; endedAt: number | null; isBinge: boolean }
// prettier-ignore
export interface DoomScrollSignal { id: string; appId: string; scrollCount: number; durationMs: number; triggeredAt: number; velocity: number }
// prettier-ignore
export interface BedtimeConfig { enabled: boolean; startHour: number; endHour: number; dimLevel: number; blockNonEssential: boolean }
// prettier-ignore
export interface WellbeingReport { period: 'daily' | 'weekly'; totalMinutes: number; bingeCount: number; doomScrollAlerts: number; appBreakdown: Record<string, number> }
// prettier-ignore
export interface CompulsionPattern { id: string; type: 'app-switching' | 'rapid-check' | 'late-night'; appId: string; count: number; detectedAt: number; threshold: number }
// prettier-ignore
export interface ScreenTimeLimit { appId: string; dailyLimitMs: number; usedMs: number; warned: boolean; blocked: boolean; carryOverMs: number }
// prettier-ignore
export interface BreakReminder { id: string; intervalMs: number; lastBreakAt: number; snoozeCount: number; forced: boolean; suggestion: string }
// prettier-ignore
export interface RetreatModeConfig { enabled: boolean; durationMs: number; whitelist: string[]; gradualReentry: boolean; streak: number }
// prettier-ignore
export interface RegretEntry { id: string; appId: string; sessionId: string; rating: number; timestamp: number }
// prettier-ignore
export interface CrisisResource { region: string; name: string; phone: string; available247: boolean }
