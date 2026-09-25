import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { RecurringService, type CalendarEvent } from './recurring.service';

export interface BookingLink {
  id: string;
  userId: string;
  slug: string;
  title: string;
  hostTitle?: string;
  description: string;
  duration: number;
  availableDays: number[];
  startHour: number;
  endHour: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface BookingSlot {
  start: Date;
  end: Date;
  available: boolean;
}
export interface BookerInfo {
  name: string;
  email: string;
  notes?: string;
}
export interface CreateBookingLinkInput {
  userId: string;
  slug: string;
  title: string;
  description?: string;
  duration: number;
  availableDays?: number[];
  startHour?: number;
  endHour?: number;
}
export interface SlotLock {
  lockId: string;
  slug: string;
  userId: string;
  slotTime: number;
  bookerEmail: string;
  expiresAt: Date;
}
export interface BookingConfirmationResult {
  event: unknown;
  icsContent: string;
}
export interface PrismaClient {
  bookingLink: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    delete?: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
  event: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  user?: {
    findUnique: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function formatIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function generateIcsInvite(options: {
  uid: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  status?: string;
}): string {
  const dtStamp = formatIcsDateTime(new Date());
  const dtStart = formatIcsDateTime(options.startTime);
  const dtEnd = formatIcsDateTime(options.endTime);
  const status = options.status || 'CONFIRMED';
  const cleanSummary = (options.summary || '').replace(/\r?\n/g, ' ');
  const cleanDescription = (options.description || '').replace(/\r?\n/g, '\\n');
  const orgName = (options.organizer.name || 'Host').replace(/[:;]/g, '');
  const attName = (options.attendee.name || 'Attendee').replace(/[:;]/g, '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuantMail//Calendar Booking Engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${options.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanSummary}`,
    `DESCRIPTION:${cleanDescription}`,
    `ORGANIZER;CN=${orgName}:mailto:${options.organizer.email}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${attName}:mailto:${options.attendee.email}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export class SlotLockStore {
  private locks = new Map<string, SlotLock>();

  cleanup(): void {
    const now = Date.now();
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAt.getTime() <= now) {
        this.locks.delete(id);
      }
    }
  }

  getLock(lockId: string): SlotLock | undefined {
    this.cleanup();
    return this.locks.get(lockId);
  }

  getActiveLock(slug: string, userId: string, slotTimeMs: number): SlotLock | undefined {
    this.cleanup();
    const now = Date.now();
    for (const lock of this.locks.values()) {
      if (lock.expiresAt.getTime() <= now) continue;
      if ((lock.slug === slug || lock.userId === userId) && lock.slotTime === slotTimeMs) {
        return lock;
      }
    }
    return undefined;
  }

  isSlotLocked(slug: string, userId: string, slotTimeMs: number): boolean {
    return this.getActiveLock(slug, userId, slotTimeMs) !== undefined;
  }

  setLock(lock: SlotLock): void {
    this.cleanup();
    this.locks.set(lock.lockId, lock);
  }

  removeLock(lockId: string): boolean {
    return this.locks.delete(lockId);
  }

  clear(): void {
    this.locks.clear();
  }
}

export const globalSlotLockStore = new SlotLockStore();

const MAX_SLOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class BookingLinkService {
  constructor(private readonly prisma: PrismaClient) {}

  static clearLocks(): void {
    globalSlotLockStore.clear();
  }

  async createBookingLink(input: CreateBookingLinkInput): Promise<BookingLink> {
    const now = new Date();
    const link = await this.prisma.bookingLink.create({
      data: {
        userId: input.userId,
        slug: input.slug,
        title: input.title,
        description: input.description ?? '',
        duration: input.duration,
        availableDays: JSON.stringify(input.availableDays ?? [1, 2, 3, 4, 5]),
        startHour: input.startHour ?? 9,
        endHour: input.endHour ?? 17,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.toBookingLink(link);
  }

  async getBookingLink(slug: string): Promise<BookingLink> {
    const link = await this.prisma.bookingLink.findUnique({ where: { slug } });
    if (!link) throw createAppError('Booking link not found', 404, 'BOOKING_LINK_NOT_FOUND');
    return this.toBookingLink(link);
  }

  async deleteBookingLink(id: string, userId: string): Promise<void> {
    const link = (await this.prisma.bookingLink.findUnique({ where: { id } })) as Record<
      string,
      unknown
    > | null;
    if (!link || link['userId'] !== userId) {
      throw createAppError('Booking link not found', 404, 'BOOKING_LINK_NOT_FOUND');
    }
    if (this.prisma.bookingLink.delete) {
      await this.prisma.bookingLink.delete({ where: { id } });
    }
  }

  async lockSlot(
    slug: string,
    slotTime: Date,
    bookerEmail: string,
  ): Promise<{ lockId: string; expiresAt: Date }> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive)
      throw createAppError('Booking link is inactive', 410, 'BOOKING_LINK_INACTIVE');

    const startTime = new Date(slotTime);
    if (Number.isNaN(startTime.getTime()))
      throw createAppError('Invalid booking slot', 400, 'INVALID_BOOKING_SLOT');

    const endTime = new Date(startTime.getTime() + link.duration * 60 * 1000);
    const dayStart = new Date(startTime);
    dayStart.setHours(link.startHour, 0, 0, 0);
    const dayEnd = new Date(startTime);
    dayEnd.setHours(link.endHour, 0, 0, 0);
    const availableDays = (link.availableDays ?? [1, 2, 3, 4, 5]).map(Number);

    if (
      startTime.getTime() < Date.now() ||
      !availableDays.includes(startTime.getDay()) ||
      startTime < dayStart ||
      endTime > dayEnd
    ) {
      throw createAppError(
        'Requested slot is outside the booking link availability',
        400,
        'INVALID_BOOKING_SLOT',
      );
    }

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (existingEvents.length > 0)
      throw createAppError('Slot is no longer available', 409, 'SLOT_UNAVAILABLE');

    const recurringEvents = (await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: dayEnd } },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, dayEnd),
    );
    if (
      expandedOccurrences.some(
        (occurrence) => startTime < occurrence.endTime && endTime > occurrence.startTime,
      )
    ) {
      throw createAppError('Selected slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    }

    const normalizedEmail = bookerEmail.trim().toLowerCase();
    const existingLock = globalSlotLockStore.getActiveLock(slug, link.userId, startTime.getTime());
    if (existingLock) {
      if (existingLock.bookerEmail === normalizedEmail) {
        existingLock.expiresAt = new Date(Date.now() + LOCK_TTL_MS);
        return { lockId: existingLock.lockId, expiresAt: existingLock.expiresAt };
      }
      throw createAppError('Slot is currently locked by another booker', 409, 'SLOT_UNAVAILABLE');
    }

    const lockId = `lock_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
    globalSlotLockStore.setLock({
      lockId,
      slug,
      userId: link.userId,
      slotTime: startTime.getTime(),
      bookerEmail: normalizedEmail,
      expiresAt,
    });

    return { lockId, expiresAt };
  }

  async releaseLock(lockId: string): Promise<void> {
    globalSlotLockStore.removeLock(lockId);
  }

  async getAvailableSlots(slug: string, date: Date): Promise<BookingSlot[]> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive) return [];
    if (!link.availableDays.includes(date.getDay())) return [];
    const dayStart = new Date(date);
    dayStart.setHours(link.startHour, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(link.endHour, 0, 0, 0);
    const slotWindowEnd = new Date(
      Math.min(dayEnd.getTime(), dayStart.getTime() + MAX_SLOT_WINDOW_MS),
    );
    const events = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: slotWindowEnd },
        endTime: { gt: dayStart },
      },
    });
    const recurringEvents = (await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: { not: null },
        startTime: { lte: slotWindowEnd },
      },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, slotWindowEnd),
    );
    const busySlots = (events as Array<Record<string, unknown>>).map((event) => ({
      start: new Date(event['startTime'] as string | Date),
      end: new Date(event['endTime'] as string | Date),
    }));
    const slots: BookingSlot[] = [];
    const slotDuration = link.duration * 60 * 1000;
    let current = dayStart.getTime();
    while (current + slotDuration <= slotWindowEnd.getTime()) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current + slotDuration);
      const conflictsWithStandard = busySlots.some(
        (busy) => busy.start < slotEnd && busy.end > slotStart,
      );
      const conflictsWithRecurring = expandedOccurrences.some(
        (occurrence) => slotStart < occurrence.endTime && slotEnd > occurrence.startTime,
      );
      const isLocked = globalSlotLockStore.isSlotLocked(slug, link.userId, slotStart.getTime());
      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !conflictsWithStandard && !conflictsWithRecurring && !isLocked,
      });
      current += slotDuration;
    }
    return slots;
  }

  async confirmBooking(
    slug: string,
    slot: Date,
    bookerInfo: BookerInfo,
    lockId?: string,
  ): Promise<BookingConfirmationResult> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive)
      throw createAppError('Booking link is inactive', 410, 'BOOKING_LINK_INACTIVE');
    const startTime = new Date(slot);
    if (Number.isNaN(startTime.getTime()))
      throw createAppError('Invalid booking slot', 400, 'INVALID_BOOKING_SLOT');
    const endTime = new Date(startTime.getTime() + link.duration * 60 * 1000);
    const dayStart = new Date(startTime);
    dayStart.setHours(link.startHour, 0, 0, 0);
    const dayEnd = new Date(startTime);
    dayEnd.setHours(link.endHour, 0, 0, 0);
    const availableDays = (link.availableDays ?? [1, 2, 3, 4, 5]).map(Number);
    if (
      startTime.getTime() < Date.now() ||
      !availableDays.includes(startTime.getDay()) ||
      startTime < dayStart ||
      endTime > dayEnd
    ) {
      throw createAppError(
        'Requested slot is outside the booking link availability',
        400,
        'INVALID_BOOKING_SLOT',
      );
    }

    const normalizedEmail = bookerInfo.email.trim().toLowerCase();
    const activeLock = globalSlotLockStore.getActiveLock(slug, link.userId, startTime.getTime());
    if (activeLock) {
      if (activeLock.bookerEmail !== normalizedEmail) {
        throw createAppError('Slot is currently locked by another booker', 409, 'SLOT_UNAVAILABLE');
      }
      if (lockId && activeLock.lockId !== lockId) {
        throw createAppError('Slot is locked with a different lockId', 409, 'SLOT_UNAVAILABLE');
      }
    }

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (existingEvents.length > 0)
      throw createAppError('Slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    const recurringEvents = (await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: dayEnd } },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, dayEnd),
    );
    if (
      expandedOccurrences.some(
        (occurrence) => startTime < occurrence.endTime && endTime > occurrence.startTime,
      )
    ) {
      throw createAppError('Selected slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    }

    const now = new Date();
    const createdEvent = await this.prisma.event.create({
      data: {
        title: `${link.title} with ${bookerInfo.name}`,
        description: bookerInfo.notes ?? '',
        startTime,
        endTime,
        allDay: false,
        location: '',
        userId: link.userId,
        attendees: JSON.stringify([
          { userId: '', email: bookerInfo.email, name: bookerInfo.name, status: 'accepted' },
        ]),
        recurrenceRule: null,
        status: 'confirmed',
        reminders: JSON.stringify([{ type: 'email', minutesBefore: 15 }]),
        createdAt: now,
        updatedAt: now,
      },
    });

    if (activeLock) {
      globalSlotLockStore.removeLock(activeLock.lockId);
    }
    if (lockId) {
      globalSlotLockStore.removeLock(lockId);
    }

    let hostEmail = `${link.userId}@quantmail.io`;
    let hostName = link.title;
    if (this.prisma.user?.findUnique) {
      try {
        const user = (await this.prisma.user.findUnique({
          where: { id: link.userId },
          select: { email: true, displayName: true },
        })) as { email?: string; displayName?: string } | null;
        if (user?.email) hostEmail = user.email;
        if (user?.displayName) hostName = user.displayName;
      } catch {
        // fallback
      }
    }

    const eventRecord = createdEvent as Record<string, unknown>;
    const eventId = String(eventRecord?.['id'] ?? randomUUID());
    const uid = `${eventId}@quantmail.io`;

    const icsContent = generateIcsInvite({
      uid,
      summary: `${link.title} with ${bookerInfo.name}`,
      description: bookerInfo.notes ?? '',
      startTime,
      endTime,
      organizer: { name: hostName, email: hostEmail },
      attendee: { name: bookerInfo.name, email: bookerInfo.email },
      status: 'CONFIRMED',
    });

    return {
      event: createdEvent,
      icsContent,
    };
  }

  async listBookings(userId: string): Promise<BookingLink[]> {
    const links = await this.prisma.bookingLink.findMany({ where: { userId } });
    return links.map((link) => this.toBookingLink(link));
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

  private toCalendarEvent(raw: Record<string, unknown>): CalendarEvent {
    return {
      id: String(raw['id']),
      title: String(raw['title']),
      description: String(raw['description'] ?? ''),
      startTime: new Date(raw['startTime'] as string | Date),
      endTime: new Date(raw['endTime'] as string | Date),
      allDay: Boolean(raw['allDay']),
      location: String(raw['location'] ?? ''),
      userId: String(raw['userId']),
      attendees: this.parseArray(raw['attendees']),
      recurrenceRule: (raw['recurrenceRule'] as string | null) ?? null,
      status: (raw['status'] as CalendarEvent['status']) ?? 'confirmed',
      reminders: this.parseArray(raw['reminders']),
      createdAt: new Date(raw['createdAt'] as string | Date),
      updatedAt: new Date(raw['updatedAt'] as string | Date),
    };
  }

  private toBookingLink(raw: unknown): BookingLink {
    const record = raw as Record<string, unknown>;
    const title = record['title'] as string;
    return {
      id: record['id'] as string,
      userId: record['userId'] as string,
      slug: record['slug'] as string,
      title,
      hostTitle: title,
      description: (record['description'] as string) ?? '',
      duration: record['duration'] as number,
      availableDays:
        typeof record['availableDays'] === 'string'
          ? JSON.parse(record['availableDays'] as string)
          : ((record['availableDays'] as number[]) ?? [1, 2, 3, 4, 5]),
      startHour: (record['startHour'] as number) ?? 9,
      endHour: (record['endHour'] as number) ?? 17,
      isActive: (record['isActive'] as boolean) ?? true,
      createdAt: new Date(record['createdAt'] as string | Date),
      updatedAt: new Date(record['updatedAt'] as string | Date),
    };
  }
}
