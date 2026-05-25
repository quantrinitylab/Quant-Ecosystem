import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string | null;
  frequency: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddContactInput {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async addContact(input: AddContactInput): Promise<Contact> {
    const existing = await (this.prisma as unknown as { contact: ContactModel }).contact.findFirst({
      where: { userId: input.userId, email: input.email },
    });

    if (existing) {
      throw createAppError('Contact with this email already exists', 409, 'CONTACT_EXISTS');
    }

    return (this.prisma as unknown as { contact: ContactModel }).contact.create({
      data: {
        userId: input.userId,
        name: input.name,
        email: input.email,
        avatar: input.avatar ?? null,
        frequency: 0,
      },
    });
  }

  async getContacts(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Contact>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    const [data, total] = await Promise.all([
      contactModel.findMany({
        where: { userId },
        skip,
        take: pageSize,
        orderBy: { frequency: 'desc' },
      }),
      contactModel.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async searchContacts(userId: string, query: string): Promise<Contact[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    return contactModel.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { frequency: 'desc' },
    });
  }

  async updateContact(
    contactId: string,
    userId: string,
    data: { name?: string; email?: string; avatar?: string },
  ): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    const contact = await contactModel.findUnique({ where: { id: contactId } });

    if (!contact) {
      throw createAppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
    }

    if (contact.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return contactModel.update({
      where: { id: contactId },
      data,
    });
  }

  async deleteContact(contactId: string, userId: string): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    const contact = await contactModel.findUnique({ where: { id: contactId } });

    if (!contact) {
      throw createAppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
    }

    if (contact.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return contactModel.delete({ where: { id: contactId } });
  }
}

// Type helper for Prisma contact model operations
interface ContactModel {
  findFirst(args: unknown): Promise<Contact | null>;
  findUnique(args: unknown): Promise<Contact | null>;
  findMany(args: unknown): Promise<Contact[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Contact>;
  update(args: unknown): Promise<Contact>;
  delete(args: unknown): Promise<Contact>;
}
