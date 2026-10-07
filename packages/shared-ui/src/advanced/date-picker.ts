// ============================================================================
// @quant/shared-ui - Advanced Date Picker Engine
// ============================================================================

import {
  DatePickerState,
  DateValue,
  TimeValue,
  CalendarMonth,
  CalendarWeek,
  CalendarDay,
  TimeSlot,
  TimezoneInfo,
  DatePickerConfig,
} from './types';

type DatePickerListener = (state: DatePickerState) => void;

export class DatePicker {
  private state: DatePickerState;
  private config: DatePickerConfig;
  private listeners: Set<DatePickerListener> = new Set();
  private monthNames: string[] = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  private dayNames: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  private timezones: TimezoneInfo[] = [
    { name: 'UTC', offset: 0, abbreviation: 'UTC', isDST: false },
    { name: 'America/New_York', offset: -5, abbreviation: 'EST', isDST: false },
    { name: 'America/Chicago', offset: -6, abbreviation: 'CST', isDST: false },
    { name: 'America/Denver', offset: -7, abbreviation: 'MST', isDST: false },
    { name: 'America/Los_Angeles', offset: -8, abbreviation: 'PST', isDST: false },
    { name: 'Europe/London', offset: 0, abbreviation: 'GMT', isDST: false },
    { name: 'Europe/Paris', offset: 1, abbreviation: 'CET', isDST: false },
    { name: 'Asia/Tokyo', offset: 9, abbreviation: 'JST', isDST: false },
    { name: 'Asia/Shanghai', offset: 8, abbreviation: 'CST', isDST: false },
    { name: 'Asia/Kolkata', offset: 5.5, abbreviation: 'IST', isDST: false },
    { name: 'Australia/Sydney', offset: 11, abbreviation: 'AEDT', isDST: true },
  ];

  constructor(config: DatePickerConfig = { mode: 'single' }) {
    this.config = {
      firstDayOfWeek: 0,
      disableWeekends: false,
      use24Hour: false,
      ...config,
    };

    const today = this.getToday();
    this.state = {
      selectedDate: null,
      selectedRange: null,
      viewDate: today,
      viewMode: 'days',
      isOpen: false,
      timeValue: config.showTime ? { hours: 12, minutes: 0, period: 'PM' } : null,
    };
  }

  // Get today's date
  private getToday(): DateValue {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }

  // Generate calendar month grid
  generateCalendarMonth(year?: number, month?: number): CalendarMonth {
    const y = year || this.state.viewDate.year;
    const m = month || this.state.viewDate.month;

    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const firstDayOfWeek = this.config.firstDayOfWeek || 0;

    // Calculate offset for first day
    let offset = startDayOfWeek - firstDayOfWeek;
    if (offset < 0) offset += 7;

    const weeks: CalendarWeek[] = [];
    let currentDay = 1 - offset;

    // Generate 6 weeks to cover all possible month layouts
    for (let week = 0; week < 6; week++) {
      const days: CalendarDay[] = [];
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const date = this.resolveDayInGrid(y, m, currentDay, daysInMonth);
        const isCurrentMonth = currentDay >= 1 && currentDay <= daysInMonth;
        const today = this.getToday();

        days.push({
          date,
          isCurrentMonth,
          isToday: this.datesEqual(date, today),
          isSelected: this.isDateSelected(date),
          isInRange: this.isDateInRange(date),
          isDisabled: this.isDateDisabled(date),
          isRangeStart: this.isRangeStart(date),
          isRangeEnd: this.isRangeEnd(date),
        });
        currentDay++;
      }
      weeks.push({ days });
    }

    return { year: y, month: m, weeks };
  }

  // Resolve a day number to a proper DateValue (handling overflow into adjacent months)
  private resolveDayInGrid(
    year: number,
    month: number,
    day: number,
    daysInMonth: number,
  ): DateValue {
    if (day < 1) {
      // Previous month
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
      return { year: prevYear, month: prevMonth, day: prevDaysInMonth + day };
    }
    if (day > daysInMonth) {
      // Next month
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return { year: nextYear, month: nextMonth, day: day - daysInMonth };
    }
    return { year, month, day };
  }

  // Select a date
  selectDate(date: DateValue): void {
    if (this.isDateDisabled(date)) return;

    if (this.config.mode === 'single') {
      this.state.selectedDate = date;
      this.state.selectedRange = null;
    } else if (this.config.mode === 'range') {
      if (!this.state.selectedRange || this.state.selectedRange.end) {
        // Start new range
        this.state.selectedRange = { start: date, end: date };
      } else {
        // Complete range
        const start = this.state.selectedRange.start;
        if (this.compareDates(date, start) >= 0) {
          this.state.selectedRange = { start, end: date };
        } else {
          this.state.selectedRange = { start: date, end: start };
        }
      }
    }

    this.notifyListeners();
  }

  // Navigate months
  nextMonth(): void {
    const { year, month } = this.state.viewDate;
    if (month === 12) {
      this.state.viewDate = { year: year + 1, month: 1, day: 1 };
    } else {
      this.state.viewDate = { year, month: month + 1, day: 1 };
    }
    this.notifyListeners();
  }

  previousMonth(): void {
    const { year, month } = this.state.viewDate;
    if (month === 1) {
      this.state.viewDate = { year: year - 1, month: 12, day: 1 };
    } else {
      this.state.viewDate = { year, month: month - 1, day: 1 };
    }
    this.notifyListeners();
  }

  // Navigate years
  nextYear(): void {
    this.state.viewDate = { ...this.state.viewDate, year: this.state.viewDate.year + 1 };
    this.notifyListeners();
  }

  previousYear(): void {
    this.state.viewDate = { ...this.state.viewDate, year: this.state.viewDate.year - 1 };
    this.notifyListeners();
  }

  // Set view mode (days, months, years)
  setViewMode(mode: 'days' | 'months' | 'years'): void {
    this.state.viewMode = mode;
    this.notifyListeners();
  }

  // Set time value
  setTime(time: Partial<TimeValue>): void {
    if (!this.state.timeValue) {
      this.state.timeValue = { hours: 12, minutes: 0, period: 'AM' };
    }
    this.state.timeValue = { ...this.state.timeValue, ...time };

    // Validate 24-hour mode
    if (this.config.use24Hour) {
      if (this.state.timeValue.hours > 23) this.state.timeValue.hours = 23;
    } else {
      if (this.state.timeValue.hours > 12) this.state.timeValue.hours = 12;
      if (this.state.timeValue.hours < 1) this.state.timeValue.hours = 1;
    }
    if (this.state.timeValue.minutes > 59) this.state.timeValue.minutes = 59;
    if (this.state.timeValue.minutes < 0) this.state.timeValue.minutes = 0;

    this.notifyListeners();
  }

  // Generate time slots
  generateTimeSlots(
    startHour: number,
    endHour: number,
    intervalMinutes: number,
    bookedSlots: TimeSlot[] = [],
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    let currentMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    while (currentMinutes < endMinutes) {
      const startTime: TimeValue = {
        hours: Math.floor(currentMinutes / 60),
        minutes: currentMinutes % 60,
      };
      const endTime: TimeValue = {
        hours: Math.floor((currentMinutes + intervalMinutes) / 60),
        minutes: (currentMinutes + intervalMinutes) % 60,
      };

      const isBooked = bookedSlots.some(
        (booked) =>
          this.timeToMinutes(booked.start) <= currentMinutes &&
          this.timeToMinutes(booked.end) > currentMinutes,
      );

      slots.push({
        start: startTime,
        end: endTime,
        available: !isBooked,
        label: this.formatTime(startTime) + ' - ' + this.formatTime(endTime),
      });

      currentMinutes += intervalMinutes;
    }

    return slots;
  }

  // Convert timezone
  convertTimezone(
    date: DateValue,
    time: TimeValue,
    fromTz: string,
    toTz: string,
  ): { date: DateValue; time: TimeValue } {
    const fromInfo = this.timezones.find((tz) => tz.name === fromTz);
    const toInfo = this.timezones.find((tz) => tz.name === toTz);
    if (!fromInfo || !toInfo) return { date, time };

    const offsetDiff = toInfo.offset - fromInfo.offset;
    const totalMinutes = time.hours * 60 + time.minutes + offsetDiff * 60;

    let days = 0;
    let minutes = totalMinutes;
    if (minutes < 0) {
      minutes += 1440;
      days = -1;
    }
    if (minutes >= 1440) {
      minutes -= 1440;
      days = 1;
    }

    const newTime: TimeValue = {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    };

    // Adjust date if day changed
    let newDate = date;
    if (days !== 0) {
      newDate = this.addDays(date, days);
    }

    return { date: newDate, time: newTime };
  }

  // Format date using pattern
  formatDate(date: DateValue, pattern: string = 'YYYY-MM-DD'): string {
    const y = String(date.year);
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    const monthName = this.monthNames[date.month - 1] ?? '';
    const shortMonth = monthName.slice(0, 3);

    return pattern
      .replace('YYYY', y)
      .replace('YY', y.slice(-2))
      .replace('MMMM', monthName)
      .replace('MMM', shortMonth)
      .replace('MM', m)
      .replace('DD', d);
  }

  // Format time
  formatTime(time: TimeValue): string {
    if (this.config.use24Hour) {
      return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
    }
    const period = time.period || (time.hours >= 12 ? 'PM' : 'AM');
    const hours12 = time.hours > 12 ? time.hours - 12 : time.hours === 0 ? 12 : time.hours;
    return `${hours12}:${String(time.minutes).padStart(2, '0')} ${period}`;
  }

  // Keyboard navigation
  handleKeyboard(key: string): void {
    if (!this.state.selectedDate && !this.state.viewDate) return;
    const current = this.state.selectedDate || this.state.viewDate;

    switch (key) {
      case 'ArrowLeft':
        this.selectDate(this.addDays(current, -1));
        break;
      case 'ArrowRight':
        this.selectDate(this.addDays(current, 1));
        break;
      case 'ArrowUp':
        this.selectDate(this.addDays(current, -7));
        break;
      case 'ArrowDown':
        this.selectDate(this.addDays(current, 7));
        break;
      case 'PageUp':
        this.previousMonth();
        break;
      case 'PageDown':
        this.nextMonth();
        break;
      case 'Home':
        this.selectDate({ ...current, day: 1 });
        break;
      case 'End': {
        const lastDay = new Date(current.year, current.month, 0).getDate();
        this.selectDate({ ...current, day: lastDay });
        break;
      }
    }
  }

  // Check if date is disabled
  private isDateDisabled(date: DateValue): boolean {
    // Check weekends
    if (this.config.disableWeekends) {
      const dayOfWeek = new Date(date.year, date.month - 1, date.day).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    }
    // Check min date
    if (this.config.minDate && this.compareDates(date, this.config.minDate) < 0) return true;
    // Check max date
    if (this.config.maxDate && this.compareDates(date, this.config.maxDate) > 0) return true;
    // Check specific disabled dates
    if (this.config.disabledDates) {
      if (this.config.disabledDates.some((d) => this.datesEqual(d, date))) return true;
    }
    return false;
  }

  // Check if date is selected
  private isDateSelected(date: DateValue): boolean {
    if (this.state.selectedDate && this.datesEqual(date, this.state.selectedDate)) return true;
    if (this.state.selectedRange) {
      return (
        this.datesEqual(date, this.state.selectedRange.start) ||
        this.datesEqual(date, this.state.selectedRange.end)
      );
    }
    return false;
  }

  // Check if date is in range
  private isDateInRange(date: DateValue): boolean {
    if (!this.state.selectedRange) return false;
    const { start, end } = this.state.selectedRange;
    return this.compareDates(date, start) >= 0 && this.compareDates(date, end) <= 0;
  }

  private isRangeStart(date: DateValue): boolean {
    return this.state.selectedRange ? this.datesEqual(date, this.state.selectedRange.start) : false;
  }

  private isRangeEnd(date: DateValue): boolean {
    return this.state.selectedRange ? this.datesEqual(date, this.state.selectedRange.end) : false;
  }

  // Date comparison utilities
  private datesEqual(a: DateValue, b: DateValue): boolean {
    return a.year === b.year && a.month === b.month && a.day === b.day;
  }

  private compareDates(a: DateValue, b: DateValue): number {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  private addDays(date: DateValue, days: number): DateValue {
    const d = new Date(date.year, date.month - 1, date.day + days);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }

  private timeToMinutes(time: TimeValue): number {
    return time.hours * 60 + time.minutes;
  }

  // Get month name
  getMonthName(month?: number): string {
    return this.monthNames[(month || this.state.viewDate.month) - 1] ?? '';
  }

  // Get day names (adjusted for first day of week)
  getDayNames(): string[] {
    const firstDay = this.config.firstDayOfWeek || 0;
    return [...this.dayNames.slice(firstDay), ...this.dayNames.slice(0, firstDay)];
  }

  // Get available timezones
  getTimezones(): TimezoneInfo[] {
    return [...this.timezones];
  }

  // Open/close
  open(): void {
    this.state.isOpen = true;
    this.notifyListeners();
  }
  close(): void {
    this.state.isOpen = false;
    this.notifyListeners();
  }
  toggle(): void {
    this.state.isOpen = !this.state.isOpen;
    this.notifyListeners();
  }

  // Get state
  getState(): DatePickerState {
    return { ...this.state };
  }

  // Subscribe
  subscribe(listener: DatePickerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  destroy(): void {
    this.listeners.clear();
  }
}

export default DatePicker;
