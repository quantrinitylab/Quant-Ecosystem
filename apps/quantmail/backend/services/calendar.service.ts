import { createAppError } from '@quant/server-core';

export interface CalendarView {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
}

export interface CalendarPrisma {
  calendar: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}

export class CalendarService {
  constructor(private readonly prisma: CalendarPrisma) {}

  async listCalendars(userId: string): Promise<CalendarView[]> {
    const rows = await this.prisma.calendar.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (rows.length === 0) {
      const primary = await this.prisma.calendar.create({
        data: { userId, name: 'Primary', color: '#fffc00', isPrimary: true },
      });
      return [this.toView(primary)];
    }

    return rows.map((row) => this.toView(row));
  }

  async createCalendar(
    userId: string,
    input: { name: string; color?: string },
  ): Promise<CalendarView> {
    const row = await this.prisma.calendar.create({
      data: {
        userId,
        name: input.name,
        color: input.color ?? null,
        isPrimary: false,
      },
    });
    return this.toView(row);
  }

  private async loadOwned(userId: string, id: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.calendar.findUnique({ where: { id } });
    if (!row) {
      throw createAppError('Calendar not found', 404, 'CALENDAR_NOT_FOUND');
    }
    if (String((row as Record<string, unknown>)['userId']) !== userId) {
      throw createAppError('Not authorized to access this calendar', 403, 'UNAUTHORIZED');
    }
    return row as Record<string, unknown>;
  }

  async updateCalendar(
    userId: string,
    id: string,
    input: { name?: string; color?: string },
  ): Promise<CalendarView> {
    await this.loadOwned(userId, id);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data['name'] = input.name;
    if (input.color !== undefined) data['color'] = input.color;

    const updated = await this.prisma.calendar.update({ where: { id }, data });
    return this.toView(updated);
  }

  async deleteCalendar(userId: string, id: string): Promise<{ deleted: true }> {
    const row = await this.loadOwned(userId, id);

    if (Boolean(row['isPrimary'])) {
      throw createAppError('Cannot delete the primary calendar', 400, 'CANNOT_DELETE_PRIMARY');
    }

    await this.prisma.calendar.delete({ where: { id } });
    return { deleted: true };
  }

  async setPrimary(userId: string, id: string): Promise<CalendarView> {
    await this.loadOwned(userId, id);

    await this.prisma.calendar.updateMany({
      where: { userId, NOT: { id } },
      data: { isPrimary: false },
    });
    const updated = await this.prisma.calendar.update({
      where: { id },
      data: { isPrimary: true },
    });
    return this.toView(updated);
  }

  private toView(row: Record<string, unknown>): CalendarView {
    return {
      id: String(row['id']),
      userId: String(row['userId']),
      name: String(row['name']),
      color: (row['color'] as string | null) ?? null,
      isPrimary: Boolean(row['isPrimary']),
    };
  }
}
