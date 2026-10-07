import { PrismaClient } from '@prisma/client';

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

export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
