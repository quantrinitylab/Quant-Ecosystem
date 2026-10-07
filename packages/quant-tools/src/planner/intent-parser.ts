import type { ParsedIntent } from '../types.js';

const CONJUNCTIONS = /\b(?:and then|after that|and also|as well as|and|then|also|plus)\b/i;

const ACTION_VERBS = [
  'send',
  'create',
  'schedule',
  'upload',
  'start',
  'message',
  'post',
  'search',
  'boost',
] as const;

const APP_MAPPING: Record<string, Record<string, string>> = {
  send: { email: 'quantmail', mail: 'quantmail', default: 'quantmail' },
  schedule: { default: 'quantcalendar' },
  create: {
    meeting: 'quantcalendar',
    event: 'quantcalendar',
    post: 'quantneon',
    default: 'quantneon',
  },
  upload: { video: 'quantube', file: 'quantdrive', default: 'quantdrive' },
  start: { meeting: 'quantmeet', call: 'quantmeet', default: 'quantmeet' },
  message: { default: 'quantchat' },
  post: { default: 'quantneon' },
  search: { default: 'quantsearch' },
  boost: { default: 'quantads' },
};

const ENTITY_KEYWORDS = ['meeting', 'event', 'email', 'video', 'file', 'post', 'campaign', 'chat'];

export class IntentParser {
  parse(
    input: string,
    context?: { currentApp?: string; currentItem?: { id: string; type: string } },
  ): ParsedIntent[] {
    const segments = this.splitSegments(input);
    return segments.map((segment) => this.parseSegment(segment, context));
  }

  private splitSegments(input: string): string[] {
    const parts = input
      .split(CONJUNCTIONS)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : [input];
  }

  private parseSegment(
    segment: string,
    context?: { currentApp?: string; currentItem?: { id: string; type: string } },
  ): ParsedIntent {
    const lower = segment.toLowerCase();
    const action = this.detectAction(lower);
    const entities = this.extractEntities(segment);
    const temporal = this.extractTemporal(segment);
    const targetApp = this.resolveTargetApp(action, lower, entities, context);

    let confidence = 0;
    if (action !== 'unknown') confidence += 0.4;
    if (Object.keys(entities).length > 0) confidence += 0.3;
    if (temporal) confidence += 0.2;
    if (targetApp) confidence += 0.1;
    confidence = Math.min(confidence, 1);

    return {
      action,
      entities,
      temporal: temporal ?? undefined,
      rawSegment: segment,
      confidence,
      targetApp: targetApp ?? undefined,
    };
  }

  private detectAction(lower: string): string {
    for (const verb of ACTION_VERBS) {
      if (lower.includes(verb)) {
        return verb;
      }
    }
    return 'unknown';
  }

  private extractEntities(segment: string): Record<string, string> {
    const entities: Record<string, string> = {};

    const MAX_SEGMENT_LENGTH = 1000;
    const safeSegment =
      segment.length > MAX_SEGMENT_LENGTH ? segment.slice(0, MAX_SEGMENT_LENGTH) : segment;

    const emailMatch = safeSegment.match(/[\w.+%-]{1,64}@[\w.-]{1,255}\.[a-zA-Z]{2,24}/);
    if (emailMatch) {
      entities['email'] = emailMatch[0];
    }

    const mentionMatch = safeSegment.match(/@(\w+)/);
    if (mentionMatch) {
      entities['mention'] = mentionMatch[1]!;
    }

    if (/\bthe team\b/i.test(safeSegment)) {
      entities['group'] = 'team';
    }
    if (/\beveryone\b/i.test(safeSegment)) {
      entities['group'] = 'everyone';
    }

    const quotedMatch = safeSegment.match(/"([^"]+)"|'([^']+)'/);
    if (quotedMatch) {
      entities['content'] = quotedMatch[1] ?? quotedMatch[2] ?? '';
    }

    const prepMatch = safeSegment.match(/\b(?:to|with|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (prepMatch && !entities['email']) {
      entities['recipient'] = prepMatch[1]!;
    }

    // Entity keywords
    for (const keyword of ENTITY_KEYWORDS) {
      if (segment.toLowerCase().includes(keyword)) {
        entities['type'] = keyword;
        break;
      }
    }

    return entities;
  }

  private extractTemporal(
    segment: string,
  ): { startTime?: string; endTime?: string; duration?: number } | null {
    const lower = segment.toLowerCase();
    let result: { startTime?: string; endTime?: string; duration?: number } | null = null;

    // "tomorrow"
    if (/\btomorrow\b/.test(lower)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      result = { startTime: tomorrow.toISOString() };
    }

    // "next Monday/Tuesday/..."
    const dayMatch = lower.match(
      /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    );
    if (dayMatch) {
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const targetDay = dayNames.indexOf(dayMatch[1]!);
      const today = new Date();
      const currentDay = today.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + daysAhead);
      nextDay.setHours(9, 0, 0, 0);
      result = { startTime: nextDay.toISOString() };
    }

    // "at Xpm" or "at X:XX" or "at Xam"
    const timeMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]!, 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3];
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      if (result?.startTime) {
        const d = new Date(result.startTime);
        d.setHours(hours, minutes, 0, 0);
        result.startTime = d.toISOString();
      } else {
        const d = new Date();
        d.setHours(hours, minutes, 0, 0);
        if (d.getTime() < Date.now()) {
          d.setDate(d.getDate() + 1);
        }
        result = { startTime: d.toISOString() };
      }
    }

    // "in X hours/minutes"
    const durationMatch = lower.match(/\bin\s+(\d+)\s+(hour|hours|minute|minutes|min|mins)\b/);
    if (durationMatch) {
      const amount = parseInt(durationMatch[1]!, 10);
      const unit = durationMatch[2]!;
      const ms = unit.startsWith('hour') ? amount * 3600000 : amount * 60000;
      const future = new Date(Date.now() + ms);
      result = result ?? {};
      result.startTime = future.toISOString();
      result.duration = ms;
    }

    // "for X hours/minutes" (duration only)
    const forDuration = lower.match(/\bfor\s+(\d+)\s+(hour|hours|minute|minutes|min|mins)\b/);
    if (forDuration) {
      const amount = parseInt(forDuration[1]!, 10);
      const unit = forDuration[2]!;
      const ms = unit.startsWith('hour') ? amount * 3600000 : amount * 60000;
      result = result ?? {};
      result.duration = ms;
    }

    return result;
  }

  private resolveTargetApp(
    action: string,
    lower: string,
    entities: Record<string, string>,
    context?: { currentApp?: string; currentItem?: { id: string; type: string } },
  ): string | null {
    const mapping = APP_MAPPING[action];
    if (!mapping) return context?.currentApp ?? null;

    // Check entity keywords for specific sub-mapping
    for (const [keyword, app] of Object.entries(mapping)) {
      if (keyword !== 'default' && lower.includes(keyword)) {
        return app;
      }
    }

    // Check entities type
    const entityType = entities['type'];
    if (entityType && mapping[entityType]) {
      return mapping[entityType]!;
    }

    return mapping['default'] ?? context?.currentApp ?? null;
  }
}

// Security: CodeQL #177: email regex uses bounded quantifiers (linear time).
