import type { Surface, ContentType, ScheduleSuggestion } from './types.js';

interface PeakHours {
  weekday: number[];
  weekend: number[];
}

const PLATFORM_PEAK_HOURS: Record<Surface, PeakHours> = {
  quantube: {
    weekday: [12, 17, 18, 19, 20, 21],
    weekend: [10, 11, 14, 15, 16, 17, 18, 19],
  },
  quantsync: {
    weekday: [7, 8, 12, 13, 18, 19, 20, 21, 22],
    weekend: [9, 10, 11, 14, 15, 19, 20, 21],
  },
  quantneon: {
    weekday: [11, 12, 13, 17, 18, 19],
    weekend: [10, 11, 12, 15, 16, 17],
  },
  quantmail: {
    weekday: [6, 7, 8, 9, 10],
    weekend: [8, 9, 10],
  },
};

const CONTENT_TYPE_WEIGHTS: Record<ContentType, Record<string, number>> = {
  video: { morning: 0.6, afternoon: 0.8, evening: 1.0 },
  image: { morning: 0.8, afternoon: 1.0, evening: 0.7 },
  text: { morning: 1.0, afternoon: 0.7, evening: 0.5 },
  audio: { morning: 0.9, afternoon: 0.7, evening: 0.8 },
};

export class AISchedulingService {
  suggestOptimalTime(
    surface: Surface,
    audienceTimezone: string,
    contentType: ContentType,
  ): ScheduleSuggestion {
    const now = new Date();
    const peakHours = PLATFORM_PEAK_HOURS[surface];
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const hours = isWeekend ? peakHours.weekend : peakHours.weekday;

    const bestHour = this.selectBestHour(hours, contentType);
    const suggestedTime = this.buildSuggestedTime(bestHour, audienceTimezone);

    const timeOfDay = this.getTimeOfDay(bestHour);
    const weight = CONTENT_TYPE_WEIGHTS[contentType][timeOfDay] ?? 0.5;

    return {
      surface,
      suggestedTime,
      reason: `Peak engagement for ${surface} ${contentType} content at ${bestHour}:00 ${audienceTimezone}`,
      confidence: Math.min(0.95, 0.6 + weight * 0.3),
    };
  }

  suggestBatch(
    surfaces: Surface[],
    audienceTimezone: string,
    contentType: ContentType,
  ): ScheduleSuggestion[] {
    return surfaces.map((surface) =>
      this.suggestOptimalTime(surface, audienceTimezone, contentType),
    );
  }

  private selectBestHour(hours: number[], contentType: ContentType): number {
    let bestHour = hours[0] ?? 12;
    let bestScore = 0;

    for (const hour of hours) {
      const timeOfDay = this.getTimeOfDay(hour);
      const weight = CONTENT_TYPE_WEIGHTS[contentType][timeOfDay] ?? 0.5;
      if (weight > bestScore) {
        bestScore = weight;
        bestHour = hour;
      }
    }

    return bestHour;
  }

  private getTimeOfDay(hour: number): string {
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  private buildSuggestedTime(hour: number, _timezone: string): Date {
    const now = new Date();
    const suggested = new Date(now);
    suggested.setHours(hour, 0, 0, 0);

    // If the suggested time is in the past, schedule for tomorrow
    if (suggested <= now) {
      suggested.setDate(suggested.getDate() + 1);
    }

    return suggested;
  }
}
