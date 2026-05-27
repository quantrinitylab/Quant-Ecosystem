// ============================================================================
// QuantMail - Email Snooze Service
// Snooze emails to reappear at a specified time
// ============================================================================

export interface SnoozedEmail {
  id: string;
  emailId: string;
  snoozedAt: number;
  wakeAt: number;
  status: 'snoozed' | 'woken' | 'cancelled';
}

export type SnoozePreset = 'later_today' | 'tomorrow' | 'next_week' | 'next_month' | 'custom';

export class EmailSnoozeService {
  private snoozedEmails: Map<string, SnoozedEmail> = new Map();
  private snoozeCounter = 0;

  snooze(emailId: string, until: number | SnoozePreset): SnoozedEmail {
    const wakeAt = typeof until === 'number' ? until : this.getWakeTime(until);
    const now = Date.now();

    if (wakeAt <= now) {
      throw new Error('Wake time must be in the future');
    }

    this.snoozeCounter += 1;
    const snoozed: SnoozedEmail = {
      id: `snooze-${this.snoozeCounter}`,
      emailId,
      snoozedAt: now,
      wakeAt,
      status: 'snoozed',
    };

    this.snoozedEmails.set(snoozed.id, snoozed);
    return snoozed;
  }

  unsnooze(emailId: string): boolean {
    for (const [id, snoozed] of this.snoozedEmails.entries()) {
      if (snoozed.emailId === emailId && snoozed.status === 'snoozed') {
        this.snoozedEmails.set(id, { ...snoozed, status: 'cancelled' });
        return true;
      }
    }
    return false;
  }

  getSnoozed(): SnoozedEmail[] {
    return Array.from(this.snoozedEmails.values()).filter((s) => s.status === 'snoozed');
  }

  getWakeTime(preset: SnoozePreset): number {
    const now = new Date();

    switch (preset) {
      case 'later_today': {
        const later = new Date(now);
        later.setHours(now.getHours() + 3);
        return later.getTime();
      }
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.getTime();
      }
      case 'next_week': {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(9, 0, 0, 0);
        return nextWeek.getTime();
      }
      case 'next_month': {
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setHours(9, 0, 0, 0);
        return nextMonth.getTime();
      }
      case 'custom':
        return now.getTime() + 86400000; // Default 24h for custom
    }
  }

  checkAndWake(): SnoozedEmail[] {
    const now = Date.now();
    const woken: SnoozedEmail[] = [];

    for (const [id, snoozed] of this.snoozedEmails.entries()) {
      if (snoozed.status === 'snoozed' && snoozed.wakeAt <= now) {
        const updated: SnoozedEmail = { ...snoozed, status: 'woken' };
        this.snoozedEmails.set(id, updated);
        woken.push(updated);
      }
    }

    return woken;
  }
}
