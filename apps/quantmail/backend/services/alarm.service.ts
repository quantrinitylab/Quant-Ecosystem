export interface AlarmEvent {
  id: string;
  title: string;
  startTime: Date;
  status: string;
  reminders: Array<{ type: string; minutesBefore: number }>;
}

export interface DueAlarm {
  eventId: string;
  title: string;
  startTime: string;
  fireAt: string;
  minutesUntilStart: number;
}

const DEFAULT_RING_WINDOW_SEC = 120;

export class AlarmService {
  constructor(private readonly ringWindowSec: number = DEFAULT_RING_WINDOW_SEC) {}

  getDueCallAlarms(events: AlarmEvent[], now: Date = new Date()): DueAlarm[] {
    const nowMs = now.getTime();
    const ringMs = this.ringWindowSec * 1000;
    const due: DueAlarm[] = [];

    for (const event of events) {
      if (event.status === 'cancelled') continue;
      const start = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
      const startMs = start.getTime();
      if (!Number.isFinite(startMs)) continue;

      let earliestFireMs: number | null = null;
      for (const reminder of event.reminders ?? []) {
        if (reminder.type !== 'call') continue;
        const minutesBefore = Math.max(0, Number(reminder.minutesBefore) || 0);
        const fireMs = startMs - minutesBefore * 60_000;
        if (nowMs >= fireMs && nowMs <= fireMs + ringMs) {
          if (earliestFireMs === null || fireMs < earliestFireMs) {
            earliestFireMs = fireMs;
          }
        }
      }

      if (earliestFireMs !== null) {
        due.push({
          eventId: event.id,
          title: event.title,
          startTime: start.toISOString(),
          fireAt: new Date(earliestFireMs).toISOString(),
          minutesUntilStart: Math.round((startMs - nowMs) / 60_000),
        });
      }
    }

    due.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
    return due;
  }

  fetchWindow(now: Date, maxLookaheadMinutes = 24 * 60): { start: Date; end: Date } {
    return {
      start: new Date(now.getTime() - this.ringWindowSec * 1000),
      end: new Date(now.getTime() + maxLookaheadMinutes * 60_000),
    };
  }
}
