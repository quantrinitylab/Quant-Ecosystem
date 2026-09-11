import { createAppError } from '@quant/server-core';
import { RecurringService, type CalendarEvent } from './recurring.service';

export interface BookingLink {
  id: string; userId: string; slug: string; title: string; description: string; duration: number;
  availableDays: number[]; startHour: number; endHour: number; isActive: boolean; createdAt: Date; updatedAt: Date;
}
export interface BookingSlot { start: Date; end: Date; available: boolean; }
export interface BookerInfo { name: string; email: string; notes?: string; }
export interface CreateBookingLinkInput {
  userId: string; slug: string; title: string; description?: string; duration: number;
  availableDays?: number[]; startHour?: number; endHour?: number;
}
export interface PrismaClient {
  bookingLink: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  event: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

const MAX_SLOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class BookingLinkService {
  constructor(private readonly prisma: PrismaClient) {}

  async createBookingLink(input: CreateBookingLinkInput): Promise<BookingLink> {
    const now = new Date();
    const link = await this.prisma.bookingLink.create({ data: {
      userId: input.userId, slug: input.slug, title: input.title, description: input.description ?? '',
      duration: input.duration, availableDays: JSON.stringify(input.availableDays ?? [1, 2, 3, 4, 5]),
      startHour: input.startHour ?? 9, endHour: input.endHour ?? 17, isActive: true, createdAt: now, updatedAt: now,
    } });
    return this.toBookingLink(link);
  }
  async getBookingLink(slug: string): Promise<BookingLink> {
    const link = await this.prisma.bookingLink.findUnique({ where: { slug } });
    if (!link) throw createAppError('Booking link not found', 404, 'BOOKING_LINK_NOT_FOUND');
    return this.toBookingLink(link);
  }
  async getAvailableSlots(slug: string, date: Date): Promise<BookingSlot[]> {
    const link = await this.getBookingLink(slug); if (!link.isActive) return [];
    if (!link.availableDays.includes(date.getDay())) return [];
    const dayStart = new Date(date); dayStart.setHours(link.startHour, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(link.endHour, 0, 0, 0);
    const slotWindowEnd = new Date(Math.min(dayEnd.getTime(), dayStart.getTime() + MAX_SLOT_WINDOW_MS));
    const events = await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: null, startTime: { lt: slotWindowEnd }, endTime: { gt: dayStart } },
    });
    const recurringEvents = await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: slotWindowEnd } }, take: 200,
    }) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, slotWindowEnd));
    const busySlots = (events as Array<Record<string, unknown>>).map((event) => ({
      start: new Date(event['startTime'] as string | Date), end: new Date(event['endTime'] as string | Date),
    }));
    const slots: BookingSlot[] = []; const slotDuration = link.duration * 60 * 1000; let current = dayStart.getTime();
    while (current + slotDuration <= slotWindowEnd.getTime()) {
      const slotStart = new Date(current); const slotEnd = new Date(current + slotDuration);
      const conflictsWithStandard = busySlots.some((busy) => busy.start < slotEnd && busy.end > slotStart);
      const conflictsWithRecurring = expandedOccurrences.some((occurrence) => slotStart < occurrence.endTime && slotEnd > occurrence.startTime);
      slots.push({ start: slotStart, end: slotEnd, available: !conflictsWithStandard && !conflictsWithRecurring });
      current += slotDuration;
    }
    return slots;
  }
  async confirmBooking(slug: string, slot: Date, bookerInfo: BookerInfo): Promise<unknown> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive) throw createAppError('Booking link is inactive', 410, 'BOOKING_LINK_INACTIVE');
    const startTime = new Date(slot);
    if (Number.isNaN(startTime.getTime())) throw createAppError('Invalid booking slot', 400, 'INVALID_BOOKING_SLOT');
    const endTime = new Date(startTime.getTime() + link.duration * 60 * 1000);
    const dayStart = new Date(startTime); dayStart.setHours(link.startHour, 0, 0, 0);
    const dayEnd = new Date(startTime); dayEnd.setHours(link.endHour, 0, 0, 0);
    if (startTime.getTime() < Date.now() || !link.availableDays.includes(startTime.getDay()) || startTime < dayStart || endTime > dayEnd) {
      throw createAppError('Requested slot is outside the booking link availability', 400, 'INVALID_BOOKING_SLOT');
    }
    const existingEvents = await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: null, startTime: { lt: endTime }, endTime: { gt: startTime } },
    });
    if (existingEvents.length > 0) throw createAppError('Slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    const recurringEvents = await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: dayEnd } }, take: 200,
    }) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) => recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, dayEnd));
    if (expandedOccurrences.some((occurrence) => startTime < occurrence.endTime && endTime > occurrence.startTime)) {
      throw createAppError('Selected slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    }
    const now = new Date();
    return this.prisma.event.create({ data: {
      title: `${link.title} with ${bookerInfo.name}`, description: bookerInfo.notes ?? '', startTime, endTime,
      allDay: false, location: '', userId: link.userId,
      attendees: JSON.stringify([{ userId: '', email: bookerInfo.email, name: bookerInfo.name, status: 'accepted' }]),
      recurrenceRule: null, status: 'confirmed', reminders: JSON.stringify([{ type: 'email', minutesBefore: 15 }]),
      createdAt: now, updatedAt: now,
    } });
  }
  async listBookings(userId: string): Promise<BookingLink[]> {
    const links = await this.prisma.bookingLink.findMany({ where: { userId } });
    return links.map((link) => this.toBookingLink(link));
  }
  private parseArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value; if (typeof value !== 'string') return [];
    try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  private toCalendarEvent(raw: Record<string, unknown>): CalendarEvent {
    return {
      id: String(raw['id']), title: String(raw['title']), description: String(raw['description'] ?? ''),
      startTime: new Date(raw['startTime'] as string | Date), endTime: new Date(raw['endTime'] as string | Date),
      allDay: Boolean(raw['allDay']), location: String(raw['location'] ?? ''), userId: String(raw['userId']),
      attendees: this.parseArray(raw['attendees']), recurrenceRule: (raw['recurrenceRule'] as string | null) ?? null,
      status: (raw['status'] as CalendarEvent['status']) ?? 'confirmed', reminders: this.parseArray(raw['reminders']),
      createdAt: new Date(raw['createdAt'] as string | Date), updatedAt: new Date(raw['updatedAt'] as string | Date),
    };
  }
  private toBookingLink(raw: unknown): BookingLink {
    const record = raw as Record<string, unknown>;
    return {
      id: record['id'] as string, userId: record['userId'] as string, slug: record['slug'] as string,
      title: record['title'] as string, description: (record['description'] as string) ?? '', duration: record['duration'] as number,
      availableDays: typeof record['availableDays'] === 'string' ? JSON.parse(record['availableDays'] as string) : ((record['availableDays'] as number[]) ?? [1, 2, 3, 4, 5]),
      startHour: (record['startHour'] as number) ?? 9, endHour: (record['endHour'] as number) ?? 17,
      isActive: (record['isActive'] as boolean) ?? true, createdAt: new Date(record['createdAt'] as string | Date),
      updatedAt: new Date(record['updatedAt'] as string | Date),
    };
  }
}
