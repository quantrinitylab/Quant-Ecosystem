import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Photo {
  id: string;
  userId: string;
  albumId: string | null;
  caption: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  fileSize: number;
  filter: string | null;
  location: unknown;
  tags: unknown;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PhotoAlbum {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  coverPhotoUrl: string | null;
  photoCount: number;
  visibility: string;
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

export interface UploadPhotoInput {
  userId: string;
  albumId?: string;
  caption?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  fileSize: number;
  filter?: string;
  location?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateAlbumInput {
  userId: string;
  name: string;
  description?: string;
  visibility?: string;
}

export class PhotoService {
  constructor(private readonly prisma: PrismaClient) {}

  async uploadPhoto(input: UploadPhotoInput): Promise<Photo> {
    return this.prisma.photo.create({
      data: {
        userId: input.userId,
        albumId: input.albumId ?? null,
        caption: input.caption ?? null,
        imageUrl: input.imageUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        width: input.width,
        height: input.height,
        fileSize: input.fileSize,
        filter: input.filter ?? null,
        location: input.location ?? null,
        tags: input.tags ?? [],
        likeCount: 0,
        commentCount: 0,
      },
    });
  }

  async getPhoto(photoId: string): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.deletedAt) {
      throw createAppError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    }

    return photo;
  }

  async listByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Photo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.photo.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.photo.count({ where: { userId, deletedAt: null } }),
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

  async listByAlbum(
    albumId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Photo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.photo.findMany({
        where: { albumId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.photo.count({ where: { albumId, deletedAt: null } }),
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

  async deletePhoto(photoId: string, userId: string): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.deletedAt) {
      throw createAppError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    }

    if (photo.userId !== userId) {
      throw createAppError('Only the owner can delete this photo', 403, 'NOT_PHOTO_OWNER');
    }

    return this.prisma.photo.update({
      where: { id: photoId },
      data: { deletedAt: new Date() },
    });
  }

  async likePhoto(photoId: string): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.deletedAt) {
      throw createAppError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    }

    return this.prisma.photo.update({
      where: { id: photoId },
      data: { likeCount: { increment: 1 } },
    });
  }

  async addComment(photoId: string, _userId: string, _content: string): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.deletedAt) {
      throw createAppError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    }

    return this.prisma.photo.update({
      where: { id: photoId },
      data: { commentCount: { increment: 1 } },
    });
  }

  async listFeed(userId: string, options: PaginationOptions = {}): Promise<PaginatedResult<Photo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.photo.findMany({
        where: { deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.photo.count({ where: { deletedAt: null } }),
    ]);

    void userId;
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

  async getExplore(options: PaginationOptions = {}): Promise<PaginatedResult<Photo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.photo.findMany({
        where: { deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { likeCount: 'desc' },
      }),
      this.prisma.photo.count({ where: { deletedAt: null } }),
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

  async createAlbum(input: CreateAlbumInput): Promise<PhotoAlbum> {
    return this.prisma.photoAlbum.create({
      data: {
        userId: input.userId,
        name: input.name,
        description: input.description ?? null,
        coverPhotoUrl: null,
        photoCount: 0,
        visibility: input.visibility ?? 'PUBLIC',
      },
    });
  }

  async getAlbum(albumId: string): Promise<PhotoAlbum> {
    const album = await this.prisma.photoAlbum.findUnique({
      where: { id: albumId },
    });

    if (!album) {
      throw createAppError('Album not found', 404, 'ALBUM_NOT_FOUND');
    }

    return album;
  }

  async listAlbumsByUser(userId: string): Promise<PhotoAlbum[]> {
    return this.prisma.photoAlbum.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
