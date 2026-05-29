import type { EventSuggestion, EventConfig } from '../types.js';

interface CalendarEntry {
  date: number;
  title: string;
  type: string;
}

interface Preferences {
  interests: string[];
  location: string;
  maxDistance?: number;
}

export class EventSuggesterAgent {
  private config: EventConfig = { interests: [], location: '' };

  configure(interests: string[], location: string): void {
    this.config = { interests, location };
  }

  getConfig(): EventConfig {
    return { ...this.config };
  }

  analyze(calendar: CalendarEntry[], preferences: Preferences): EventSuggestion[] {
    const freeSlots = this.findFreeSlots(calendar);
    return freeSlots.map((slot, idx) => {
      const interest = preferences.interests[idx % preferences.interests.length] ?? 'general';
      return {
        eventId: `evt-${slot}-${idx}`,
        title: `${interest} event near ${preferences.location}`,
        reason: `Matches your interest in ${interest} and fits your schedule`,
        relevanceScore: Math.max(0.5, 1 - idx * 0.1),
        suggestedAction: 'add-to-calendar',
      };
    });
  }

  getSuggestions(date: number): EventSuggestion[] {
    return this.config.interests.map((interest, idx) => ({
      eventId: `evt-${date}-${idx}`,
      title: `${interest} event near ${this.config.location}`,
      reason: `Based on your interest in ${interest}`,
      relevanceScore: Math.max(0.5, 1 - idx * 0.1),
      suggestedAction: 'add-to-calendar',
    }));
  }

  private findFreeSlots(calendar: CalendarEntry[]): number[] {
    const occupiedDays = new Set(calendar.map((e) => e.date));
    const slots: number[] = [];
    const now = Date.now();
    for (let i = 1; i <= 7; i++) {
      const day = now + i * 86400000;
      if (!occupiedDays.has(day)) {
        slots.push(day);
      }
    }
    return slots;
  }
}
