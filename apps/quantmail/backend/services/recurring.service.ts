import { createAppError } from '@quant/server-core';

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: string[];
  byMonth?: number[];
  exceptions?: Date[];
}

export interface CreateRecurringInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  userId: string;
  rule: RecurrenceRule;
}

export interface CalendarEvent {
  id: string;
  parentId?: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string;
  userId: string;
  attendees: unknown[];
  recurrenceRule: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  reminders: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaClient {
  event: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
  };
}

const FREQUENCIES = new Set<RecurrenceRule['frequency']>(['daily', 'weekly', 'monthly', 'yearly']);
const WEEKDAYS = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const DAY_MS = 86_400_000;
const MAX_OCCURRENCES = 500;

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export class RecurringService {
  private readonly prisma: PrismaClient | null;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? null;
  }

  async createRecurring(userId: string, input: CreateRecurringInput): Promise<CalendarEvent> {
    if (!this.prisma) throw createAppError('Prisma client not available', 500, 'INTERNAL_ERROR');
    if (input.endTime < input.startTime) throw createAppError('`endTime` cannot be before `startTime`', 400, 'INVALID_RANGE');
    const now = new Date();
    const event = await this.prisma.event.create({ data: {
      title: input.title, description: input.description ?? '', startTime: input.startTime,
      endTime: input.endTime, allDay: false, location: '', userId,
      attendees: JSON.stringify([]), recurrenceRule: this.serializeRRule(input.rule),
      status: 'confirmed', reminders: JSON.stringify([]), createdAt: now, updatedAt: now,
    } });
    return this.toCalendarEvent(event);
  }

  expandOccurrences(event: CalendarEvent, startRange: Date, endRange: Date): CalendarEvent[] {
    return this.expandRecurrence(event, startRange, endRange);
  }

  expandRecurrence(event: CalendarEvent, startRange: Date, endRange: Date): CalendarEvent[] {
    if (!event.recurrenceRule) return [event];
    if (endRange < startRange) return [];
    let rule: RecurrenceRule;
    try {
      rule = this.parseRRule(event.recurrenceRule);
    } catch (error) {
      console.warn(`Unable to expand corrupt recurrence rule for event ${event.id}`, error);
      return [event];
    }
    const occurrences: CalendarEvent[] = [];
    const duration = Math.max(0, event.endTime.getTime() - event.startTime.getTime());
    const exceptionSet = new Set((rule.exceptions ?? []).map((value) => value.toISOString().slice(0, 10)));
    let current = this.fastForward(event.startTime, startRange, duration, rule);
    let generatedCount = 0;
    const effectiveCount = Math.min(rule.count ?? Number.POSITIVE_INFINITY, MAX_OCCURRENCES);
    while (current <= endRange && occurrences.length < MAX_OCCURRENCES) {
      if (generatedCount >= effectiveCount) break;
      if (rule.until && current > rule.until) break;
      if (this.matchesRule(current, rule, event.startTime)) {
        const excluded = exceptionSet.has(current.toISOString().slice(0, 10));
        if (!excluded) {
          generatedCount += 1;
          const occurrenceEnd = new Date(current.getTime() + duration);
          if (current <= endRange && occurrenceEnd >= startRange) {
            occurrences.push({ ...event, parentId: event.parentId ?? event.id,
              id: `${event.id}_${current.toISOString()}`, startTime: new Date(current), endTime: occurrenceEnd });
          }
        }
      }
      const next = this.advanceDate(current, rule, event.startTime.getUTCDate());
      if (next.getTime() <= current.getTime()) break;
      current = next;
    }
    return occurrences;
  }

  addException(eventId: string, _userId: string, exceptionDate: Date): { eventId: string; exceptionDate: Date } {
    return { eventId, exceptionDate };
  }

  async updateSingle(
    occurrenceId: string,
    userId: string,
    data: { title?: string; description?: string; startTime?: Date; endTime?: Date },
  ): Promise<CalendarEvent> {
    if (!this.prisma) throw createAppError('Prisma client not available', 500, 'INTERNAL_ERROR');
    const parentId = occurrenceId.split('_')[0];
    if (!parentId) throw createAppError('Invalid occurrence ID', 400, 'INVALID_OCCURRENCE_ID');
    const parent = await this.prisma.event.findUnique({ where: { id: parentId } });
    if (!parent) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    const record = parent as Record<string, unknown>;
    if (record['userId'] !== userId) throw createAppError('Not authorized', 403, 'UNAUTHORIZED');
    const now = new Date();
    const created = await this.prisma.event.create({ data: {
      title: data.title ?? record['title'], description: data.description ?? record['description'] ?? '',
      startTime: data.startTime ?? record['startTime'], endTime: data.endTime ?? record['endTime'],
      allDay: record['allDay'] ?? false, location: record['location'] ?? '', userId,
      attendees: record['attendees'] ?? JSON.stringify([]), recurrenceRule: null,
      status: record['status'] ?? 'confirmed', reminders: record['reminders'] ?? JSON.stringify([]),
      createdAt: now, updatedAt: now,
    } });
    return this.toCalendarEvent(created);
  }

  async updateAll(
    recurringId: string,
    userId: string,
    data: { title?: string; description?: string; startTime?: Date; endTime?: Date },
  ): Promise<CalendarEvent> {
    if (!this.prisma) throw createAppError('Prisma client not available', 500, 'INTERNAL_ERROR');
    const event = await this.prisma.event.findUnique({ where: { id: recurringId } });
    if (!event) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    const record = event as Record<string, unknown>;
    if (record['userId'] !== userId) throw createAppError('Not authorized', 403, 'UNAUTHORIZED');
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'startTime', 'endTime'] as const) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    const updated = await this.prisma.event.update({ where: { id: recurringId }, data: updateData });
    return this.toCalendarEvent(updated);
  }

  parseRRule(rruleString: string): RecurrenceRule {
    const source = rruleString.trim();
    const preset = source.toLowerCase();
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(preset)) {
      return { frequency: preset as RecurrenceRule['frequency'], interval: 1 };
    }
    if (preset === 'every weekday' || preset === 'weekdays') {
      return { frequency: 'weekly', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    }
    const normalized = source.replace(/^RRULE:/i, '');
    if (!normalized.includes('=')) this.invalidRule();
    const values = new Map<string, string>();
    for (const part of normalized.split(';')) {
      const separator = part.indexOf('=');
      if (separator <= 0 || separator === part.length - 1) this.invalidRule();
      values.set(part.slice(0, separator).toUpperCase(), part.slice(separator + 1));
    }
    const frequency = values.get('FREQ')?.toLowerCase() as RecurrenceRule['frequency'] | undefined;
    if (!frequency || !FREQUENCIES.has(frequency)) this.invalidRule();
    const interval = values.has('INTERVAL') ? Number(values.get('INTERVAL')) : 1;
    if (!Number.isInteger(interval) || interval < 1) this.invalidRule();
    const rule: RecurrenceRule = { frequency, interval };
    if (values.has('COUNT')) {
      const count = Number(values.get('COUNT'));
      if (!Number.isInteger(count) || count < 1) this.invalidRule();
      rule.count = count;
    }
    if (values.has('UNTIL')) rule.until = this.parseRRuleDate(values.get('UNTIL')!);
    if (values.has('BYDAY')) {
      const byDay = values.get('BYDAY')!.split(',').map((value) => value.toUpperCase());
      if (byDay.some((value) => !WEEKDAYS.has(value))) this.invalidRule();
      rule.byDay = byDay;
    }
    if (values.has('BYMONTH')) {
      const byMonth = values.get('BYMONTH')!.split(',').map(Number);
      if (byMonth.some((value) => !Number.isInteger(value) || value < 1 || value > 12)) this.invalidRule();
      rule.byMonth = byMonth;
    }
    if (values.has('EXDATE')) rule.exceptions = values.get('EXDATE')!.split(',').map((value) => this.parseRRuleDate(value));
    return rule;
  }

  serializeRRule(rule: RecurrenceRule): string {
    if (!FREQUENCIES.has(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1) this.invalidRule();
    const parts = [`FREQ=${rule.frequency.toUpperCase()}`];
    if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
    if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
    if (rule.until) parts.push(`UNTIL=${this.formatRRuleDate(rule.until)}`);
    if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`);
    if (rule.byMonth?.length) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
    if (rule.exceptions?.length) parts.push(`EXDATE=${rule.exceptions.map((date) => this.formatRRuleDate(date)).join(',')}`);
    return parts.join(';');
  }

  matchesRule(date: Date, rule: RecurrenceRule, seriesStart: Date = date): boolean {
    if (rule.byDay?.length) {
      const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      if (!rule.byDay.includes(dayNames[date.getUTCDay()]!)) return false;
      if (rule.frequency === 'weekly' && rule.interval > 1) {
        const elapsedWeeks = Math.floor(
          (this.startOfUtcWeek(date).getTime() - this.startOfUtcWeek(seriesStart).getTime()) / (7 * DAY_MS),
        );
        if (elapsedWeeks % rule.interval !== 0) return false;
      }
    }
    if (rule.byMonth?.length && !rule.byMonth.includes(date.getUTCMonth() + 1)) return false;
    return true;
  }

  private fastForward(seriesStart: Date, startRange: Date, duration: number, rule: RecurrenceRule): Date {
    const target = new Date(startRange.getTime() - duration);
    if (target <= seriesStart || rule.count !== undefined) return new Date(seriesStart);
    if (rule.byDay?.length) {
      const reserveDays = Math.max(7, 7 * rule.interval);
      const jumpDays = Math.max(0, Math.floor((target.getTime() - seriesStart.getTime()) / DAY_MS) - reserveDays);
      const jumped = new Date(seriesStart);
      jumped.setUTCDate(jumped.getUTCDate() + jumpDays);
      return jumped;
    }
    if (rule.frequency === 'daily' || rule.frequency === 'weekly') {
      const intervalDays = rule.frequency === 'daily' ? rule.interval : 7 * rule.interval;
      const jumps = Math.max(0, Math.floor((target.getTime() - seriesStart.getTime()) / (intervalDays * DAY_MS)));
      const jumped = new Date(seriesStart);
      jumped.setUTCDate(jumped.getUTCDate() + jumps * intervalDays);
      return jumped;
    }
    if (rule.frequency === 'monthly') {
      const monthDifference = (target.getUTCFullYear() - seriesStart.getUTCFullYear()) * 12 + target.getUTCMonth() - seriesStart.getUTCMonth();
      const jumps = Math.max(0, Math.floor(monthDifference / rule.interval));
      let candidate = this.shiftUtcMonths(seriesStart, jumps * rule.interval, seriesStart.getUTCDate());
      if (candidate > target && jumps > 0) candidate = this.shiftUtcMonths(seriesStart, (jumps - 1) * rule.interval, seriesStart.getUTCDate());
      return candidate;
    }
    const yearDifference = target.getUTCFullYear() - seriesStart.getUTCFullYear();
    const jumps = Math.max(0, Math.floor(yearDifference / rule.interval));
    let candidate = this.shiftUtcYears(seriesStart, jumps * rule.interval);
    if (candidate > target && jumps > 0) candidate = this.shiftUtcYears(seriesStart, (jumps - 1) * rule.interval);
    return candidate;
  }

  private advanceDate(date: Date, rule: RecurrenceRule, targetDay: number = date.getUTCDate()): Date {
    const next = new Date(date);
    if ((rule.frequency === 'daily' || rule.frequency === 'weekly') && rule.byDay?.length) {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    if (rule.frequency === 'daily') {
      next.setUTCDate(next.getUTCDate() + rule.interval);
      return next;
    }
    if (rule.frequency === 'weekly') {
      next.setUTCDate(next.getUTCDate() + 7 * rule.interval);
      return next;
    }
    if (rule.frequency === 'monthly') return this.shiftUtcMonths(next, rule.interval, targetDay);
    return this.shiftUtcYears(next, rule.interval);
  }

  private shiftUtcMonths(date: Date, months: number, targetDay: number = date.getUTCDate()): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const targetYear = year + Math.floor((month + months) / 12);
    const targetMonth = ((month + months) % 12 + 12) % 12;
    const daysInMonth = daysInUtcMonth(targetYear, targetMonth);
    const day = Math.min(targetDay, daysInMonth);
    const shifted = new Date(date.getTime());
    shifted.setUTCFullYear(targetYear, targetMonth, day);
    return shifted;
  }

  private shiftUtcYears(date: Date, years: number): Date {
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    const target = new Date(date);
    target.setUTCDate(1);
    target.setUTCFullYear(target.getUTCFullYear() + years);
    target.setUTCMonth(month);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), month + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target;
  }

  private startOfUtcWeek(value: Date): Date {
    const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
    return result;
  }

  private parseRRuleDate(value: string): Date {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(value);
    if (!match) return this.invalidRule();
    const date = new Date(Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0),
    ));
    if (Number.isNaN(date.getTime())) return this.invalidRule();
    return date;
  }

  private formatRRuleDate(date: Date): string {
    if (Number.isNaN(date.getTime())) return this.invalidRule();
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  private invalidRule(): never {
    throw createAppError('Invalid recurrence rule', 400, 'INVALID_RECURRENCE_RULE');
  }

  private parseArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toCalendarEvent(raw: unknown): CalendarEvent {
    const record = raw as Record<string, unknown>;
    return {
      id: String(record['id']), title: String(record['title']), description: String(record['description'] ?? ''),
      startTime: new Date(record['startTime'] as string | Date), endTime: new Date(record['endTime'] as string | Date),
      allDay: Boolean(record['allDay']), location: String(record['location'] ?? ''), userId: String(record['userId']),
      attendees: this.parseArray(record['attendees']), recurrenceRule: (record['recurrenceRule'] as string | null) ?? null,
      status: (record['status'] as CalendarEvent['status']) ?? 'confirmed', reminders: this.parseArray(record['reminders']),
      createdAt: new Date(record['createdAt'] as string | Date), updatedAt: new Date(record['updatedAt'] as string | Date),
    };
  }
}
