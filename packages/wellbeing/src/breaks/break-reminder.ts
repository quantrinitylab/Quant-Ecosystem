import type { BreakReminder } from '../types.js';

const SUGGESTIONS = [
  'Stand up and stretch',
  'Look at something 20 feet away for 20 seconds',
  'Take a short walk',
  'Do some deep breathing',
  'Get a glass of water',
];

export class BreakReminderService {
  private reminders = new Map<string, BreakReminder>();
  private bingeMultiplier = 1;

  createReminder(intervalMs: number): BreakReminder {
    const id = crypto.randomUUID();
    const reminder: BreakReminder = {
      id,
      intervalMs,
      lastBreakAt: Date.now(),
      snoozeCount: 0,
      forced: false,
      suggestion: SUGGESTIONS[0]!,
    };
    this.reminders.set(id, reminder);
    return reminder;
  }

  checkDue(id: string, now = Date.now()): boolean {
    const r = this.reminders.get(id);
    if (!r) return false;
    const effectiveInterval = r.intervalMs / this.bingeMultiplier;
    return now - r.lastBreakAt >= effectiveInterval;
  }

  snooze(id: string): { nextMs: number; forced: boolean } | null {
    const r = this.reminders.get(id);
    if (!r) return null;
    r.snoozeCount++;
    if (r.snoozeCount >= 3) {
      r.forced = true;
      return { nextMs: 0, forced: true };
    }
    const delays = [300_000, 180_000];
    const nextMs = r.snoozeCount <= 2 ? delays[r.snoozeCount - 1]! : 0;
    return { nextMs, forced: false };
  }

  takeBreak(id: string): boolean {
    const r = this.reminders.get(id);
    if (!r) return false;
    r.lastBreakAt = Date.now();
    r.snoozeCount = 0;
    r.forced = false;
    r.suggestion = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]!;
    return true;
  }

  setBingeMode(active: boolean): void {
    this.bingeMultiplier = active ? 2 : 1;
  }

  getReminder(id: string): BreakReminder | null {
    return this.reminders.get(id) ?? null;
  }

  getSuggestion(id: string): string | null {
    const r = this.reminders.get(id);
    return r?.suggestion ?? null;
  }
}
