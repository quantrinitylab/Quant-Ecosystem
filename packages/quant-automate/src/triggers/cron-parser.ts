import type { CronSchedule } from '../types.js';

export class CronParser {
  parse(expression: string): CronSchedule | null {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;

    // Validate each field
    if (!this.isValidField(minute, 0, 59)) return null;
    if (!this.isValidField(hour, 0, 23)) return null;
    if (!this.isValidField(dayOfMonth, 1, 31)) return null;
    if (!this.isValidField(month, 1, 12)) return null;
    if (!this.isValidField(dayOfWeek, 0, 7)) return null;

    return { minute, hour, dayOfMonth, month, dayOfWeek, raw: expression.trim() };
  }

  getNextRun(expression: string, after?: Date): Date | null {
    const schedule = this.parse(expression);
    if (!schedule) return null;

    const start = after ? new Date(after.getTime()) : new Date();
    // Advance one minute to avoid matching the current time exactly
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    // Search forward up to 366 days
    const maxIterations = 366 * 24 * 60;
    const candidate = new Date(start.getTime());

    for (let i = 0; i < maxIterations; i++) {
      if (this.matchesSchedule(schedule, candidate)) {
        return candidate;
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
  }

  isValid(expression: string): boolean {
    return this.parse(expression) !== null;
  }

  describe(expression: string): string {
    const schedule = this.parse(expression);
    if (!schedule) return 'Invalid cron expression';

    const parts: string[] = [];

    // Describe frequency
    if (schedule.minute === '*' && schedule.hour === '*') {
      parts.push('Every minute');
    } else if (schedule.minute === '0' && schedule.hour === '*') {
      parts.push('Every hour');
    } else if (schedule.minute !== '*' && schedule.hour !== '*') {
      const hour = parseInt(schedule.hour, 10);
      const minute = parseInt(schedule.minute, 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const displayMinute = minute.toString().padStart(2, '0');
      parts.push(`At ${displayHour}:${displayMinute} ${period}`);
    } else if (schedule.hour !== '*') {
      const hour = parseInt(schedule.hour, 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      parts.push(`At ${displayHour}:00 ${period}`);
    } else {
      parts.push(`At minute ${schedule.minute}`);
    }

    // Describe day constraints
    if (schedule.dayOfWeek === '1-5') {
      parts.push('on weekdays');
    } else if (schedule.dayOfWeek === '1') {
      parts.push('on Monday');
    } else if (schedule.dayOfWeek === '0' || schedule.dayOfWeek === '7') {
      parts.push('on Sunday');
    } else if (schedule.dayOfWeek !== '*') {
      parts.push(`on day ${schedule.dayOfWeek} of the week`);
    }

    if (schedule.dayOfMonth !== '*') {
      parts.push(`on day ${schedule.dayOfMonth} of the month`);
    }

    if (schedule.month !== '*') {
      parts.push(`in month ${schedule.month}`);
    }

    return parts.join(' ') || 'Every minute';
  }

  matches(expression: string, date: Date): boolean {
    const schedule = this.parse(expression);
    if (!schedule) return false;
    return this.matchesSchedule(schedule, date);
  }

  private matchesSchedule(schedule: CronSchedule, date: Date): boolean {
    return (
      this.fieldMatches(schedule.minute, date.getMinutes(), 0, 59) &&
      this.fieldMatches(schedule.hour, date.getHours(), 0, 23) &&
      this.fieldMatches(schedule.dayOfMonth, date.getDate(), 1, 31) &&
      this.fieldMatches(schedule.month, date.getMonth() + 1, 1, 12) &&
      this.fieldMatchesDow(schedule.dayOfWeek, date.getDay())
    );
  }

  private fieldMatchesDow(field: string, value: number): boolean {
    // day of week: 0 = Sunday, 7 = Sunday (both valid)
    if (field === '*') return true;

    // Handle ranges like 1-5
    if (field.includes('-')) {
      const [startStr, endStr] = field.split('-');
      const start = parseInt(startStr ?? '0', 10);
      const end = parseInt(endStr ?? '0', 10);
      // Normalize Sunday (7 -> 0)
      const normalizedValue = value === 7 ? 0 : value;
      const normalizedStart = start === 7 ? 0 : start;
      const normalizedEnd = end === 7 ? 0 : end;
      if (normalizedStart <= normalizedEnd) {
        return normalizedValue >= normalizedStart && normalizedValue <= normalizedEnd;
      }
      return normalizedValue >= normalizedStart || normalizedValue <= normalizedEnd;
    }

    // Handle comma-separated values
    if (field.includes(',')) {
      const values = field.split(',').map((v) => parseInt(v, 10));
      return values.includes(value) || (value === 0 && values.includes(7));
    }

    const fieldNum = parseInt(field, 10);
    // 0 and 7 both mean Sunday
    if (fieldNum === 7) return value === 0;
    return fieldNum === value;
  }

  private fieldMatches(field: string, value: number, _min: number, _max: number): boolean {
    if (field === '*') return true;

    // Handle step values like */5
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return step > 0 && value % step === 0;
    }

    // Handle ranges like 1-5
    if (field.includes('-') && !field.includes(',')) {
      const [startStr, endStr] = field.split('-');
      const start = parseInt(startStr ?? '0', 10);
      const end = parseInt(endStr ?? '0', 10);
      return value >= start && value <= end;
    }

    // Handle comma-separated values
    if (field.includes(',')) {
      const values = field.split(',').map((v) => parseInt(v, 10));
      return values.includes(value);
    }

    return parseInt(field, 10) === value;
  }

  private isValidField(field: string, min: number, max: number): boolean {
    if (field === '*') return true;

    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return !isNaN(step) && step > 0 && step <= max;
    }

    if (field.includes('-')) {
      const parts = field.split('-');
      if (parts.length !== 2) return false;
      const start = parseInt(parts[0] ?? '', 10);
      const end = parseInt(parts[1] ?? '', 10);
      return !isNaN(start) && !isNaN(end) && start >= min && end <= max;
    }

    if (field.includes(',')) {
      return field.split(',').every((v) => {
        const num = parseInt(v, 10);
        return !isNaN(num) && num >= min && num <= max;
      });
    }

    const num = parseInt(field, 10);
    return !isNaN(num) && num >= min && num <= max;
  }
}
