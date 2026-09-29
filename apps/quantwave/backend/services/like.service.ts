import { PrismaClient } from '@prisma/client';

export class LikeService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async likePost(userId: string, postId: string) {
    const existing = await this.prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existing) {
      return { success: false, message: 'Already liked' };
    }

    await this.prisma.like.create({
      data: {
        userId,
        postId,
      },
    });

    return { success: true };
  }

  async unlikePost(userId: string, postId: string) {
    await this.prisma.like.deleteMany({
      where: {
        userId,
        postId,
      },
    });

    return { success: true };
  }

  async getLikeCount(postId: string) {
    return this.prisma.like.count({
      where: { postId },
    });
  }
}
