import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository, userPublicSelect } from '../repositories/user.repository';
import { MessageRepository } from '../repositories/message.repository';
import { EmailRepository } from '../repositories/email.repository';
import { PostRepository } from '../repositories/post.repository';
import { MediaRepository } from '../repositories/media.repository';
import { AISessionRepository } from '../repositories/ai-session.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { withTx } from '../transaction';
import type { PaginatedResult } from '../repositories/base.repository';

// Mock PrismaClient
function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    conversationMember: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    comment: {
      create: vi.fn(),
    },
    video: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    photo: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    story: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    aISession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    aIMessage: {
      create: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as InstanceType<typeof import('@prisma/client').PrismaClient>;
}

describe('UserRepository', () => {
  let repo: UserRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new UserRepository(mockPrisma as any);
  });

  it('should have findById method', () => {
    expect(repo.findById).toBeDefined();
    expect(typeof repo.findById).toBe('function');
  });

  it('should have findByEmail method', () => {
    expect(repo.findByEmail).toBeDefined();
    expect(typeof repo.findByEmail).toBe('function');
  });

  it('should have findByUsername method', () => {
    expect(repo.findByUsername).toBeDefined();
    expect(typeof repo.findByUsername).toBe('function');
  });

  it('should have findByPhone method', () => {
    expect(repo.findByPhone).toBeDefined();
    expect(typeof repo.findByPhone).toBe('function');
  });

  it('should have findByIdWithPassword method', () => {
    expect(repo.findByIdWithPassword).toBeDefined();
    expect(typeof repo.findByIdWithPassword).toBe('function');
  });

  it('should call prisma.user.findUnique with select for findById (public fields only)', async () => {
    (mockPrisma as any).user.findUnique.mockResolvedValue({ id: '1', email: 'test@test.com' });
    const result = await repo.findById('1');
    expect(result).toEqual({ id: '1', email: 'test@test.com' });
    expect((mockPrisma as any).user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      select: userPublicSelect,
    });
  });

  it('should call prisma.user.findUnique without select for findByIdWithPassword', async () => {
    const fullUser = { id: '1', email: 'test@test.com', passwordHash: 'hash123' };
    (mockPrisma as any).user.findUnique.mockResolvedValue(fullUser);
    const result = await repo.findByIdWithPassword('1');
    expect(result).toEqual(fullUser);
    expect((mockPrisma as any).user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should return paginated results from findMany with correct pagination math', async () => {
    const mockUsers = [{ id: '1' }, { id: '2' }];
    (mockPrisma as any).user.findMany.mockResolvedValue(mockUsers);
    (mockPrisma as any).user.count.mockResolvedValue(25);

    const result = await repo.findMany({ page: 2, pageSize: 10 });

    expect(result.data).toEqual(mockUsers);
    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(true);

    // Verify correct skip/take and select args
    expect((mockPrisma as any).user.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: userPublicSelect,
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should calculate hasNext=false and hasPrev=false on single page', async () => {
    (mockPrisma as any).user.findMany.mockResolvedValue([{ id: '1' }]);
    (mockPrisma as any).user.count.mockResolvedValue(1);

    const result = await repo.findMany({ page: 1, pageSize: 10 });

    expect(result.totalPages).toBe(1);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
  });

  it('should pass deletedAt and status change for softDelete', async () => {
    const updatedUser = { id: '1', status: 'DEACTIVATED', deletedAt: new Date() };
    (mockPrisma as any).user.update.mockResolvedValue(updatedUser);

    await repo.softDelete('1');

    expect((mockPrisma as any).user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        deletedAt: expect.any(Date),
        status: 'DEACTIVATED',
      },
    });
  });

  it('should increment loginCount and reset failedAttempts for updateLastLogin', async () => {
    const updatedUser = { id: '1', loginCount: 5, failedLoginAttempts: 0 };
    (mockPrisma as any).user.update.mockResolvedValue(updatedUser);

    await repo.updateLastLogin('1', '192.168.1.1');

    expect((mockPrisma as any).user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        lastLoginAt: expect.any(Date),
        lastLoginIp: '192.168.1.1',
        loginCount: { increment: 1 },
        failedLoginAttempts: 0,
      },
    });
  });

  it('should have incrementFailedAttempts method', () => {
    expect(repo.incrementFailedAttempts).toBeDefined();
    expect(typeof repo.incrementFailedAttempts).toBe('function');
  });
});

describe('MessageRepository', () => {
  let repo: MessageRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new MessageRepository(mockPrisma as any);
  });

  it('should have findByConversation method', () => {
    expect(repo.findByConversation).toBeDefined();
  });

  it('should have create method', () => {
    expect(repo.create).toBeDefined();
  });

  it('should have markAsRead method', () => {
    expect(repo.markAsRead).toBeDefined();
  });

  it('should have getConversationsForUser method', () => {
    expect(repo.getConversationsForUser).toBeDefined();
  });

  it('should pass conversationId filter to findByConversation', async () => {
    const mockMessages = [{ id: 'm1', content: 'hello' }];
    (mockPrisma as any).message.findMany.mockResolvedValue(mockMessages);
    (mockPrisma as any).message.count.mockResolvedValue(1);

    const result = await repo.findByConversation('conv-123', { page: 1, pageSize: 50 });

    expect(result.data).toEqual(mockMessages);
    expect((mockPrisma as any).message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-123', isDeleted: false },
      skip: 0,
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    expect((mockPrisma as any).message.count).toHaveBeenCalledWith({
      where: { conversationId: 'conv-123', isDeleted: false },
    });
  });
});

describe('EmailRepository', () => {
  let repo: EmailRepository;

  beforeEach(() => {
    repo = new EmailRepository(createMockPrisma() as any);
  });

  it('should have findByFolder method', () => {
    expect(repo.findByFolder).toBeDefined();
  });

  it('should have findByThread method', () => {
    expect(repo.findByThread).toBeDefined();
  });

  it('should have markAsRead method', () => {
    expect(repo.markAsRead).toBeDefined();
  });

  it('should have moveToFolder method', () => {
    expect(repo.moveToFolder).toBeDefined();
  });
});

describe('PostRepository', () => {
  let repo: PostRepository;

  beforeEach(() => {
    repo = new PostRepository(createMockPrisma() as any);
  });

  it('should have findByUser method', () => {
    expect(repo.findByUser).toBeDefined();
  });

  it('should have findForFeed method', () => {
    expect(repo.findForFeed).toBeDefined();
  });

  it('should have incrementLikeCount method', () => {
    expect(repo.incrementLikeCount).toBeDefined();
  });
});

describe('MediaRepository', () => {
  let repo: MediaRepository;

  beforeEach(() => {
    repo = new MediaRepository(createMockPrisma() as any);
  });

  it('should have video CRUD methods', () => {
    expect(repo.findVideoById).toBeDefined();
    expect(repo.findVideosByUser).toBeDefined();
    expect(repo.createVideo).toBeDefined();
  });

  it('should have photo CRUD methods', () => {
    expect(repo.findPhotoById).toBeDefined();
    expect(repo.findPhotosByUser).toBeDefined();
    expect(repo.createPhoto).toBeDefined();
  });

  it('should have story methods with expiration check', () => {
    expect(repo.findActiveStories).toBeDefined();
    expect(repo.createStory).toBeDefined();
  });
});

describe('AISessionRepository', () => {
  let repo: AISessionRepository;

  beforeEach(() => {
    repo = new AISessionRepository(createMockPrisma() as any);
  });

  it('should have findByUser method', () => {
    expect(repo.findByUser).toBeDefined();
  });

  it('should have create method', () => {
    expect(repo.create).toBeDefined();
  });

  it('should have addMessage method', () => {
    expect(repo.addMessage).toBeDefined();
  });

  it('should have getSessionWithMessages method', () => {
    expect(repo.getSessionWithMessages).toBeDefined();
  });
});

describe('NotificationRepository', () => {
  let repo: NotificationRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new NotificationRepository(mockPrisma as any);
  });

  it('should have findByUser method', () => {
    expect(repo.findByUser).toBeDefined();
  });

  it('should have create method', () => {
    expect(repo.create).toBeDefined();
  });

  it('should have markAsRead method', () => {
    expect(repo.markAsRead).toBeDefined();
  });

  it('should have markAllAsRead method', () => {
    expect(repo.markAllAsRead).toBeDefined();
  });

  it('should use updateMany with userId filter for markAllAsRead', async () => {
    (mockPrisma as any).notification.updateMany.mockResolvedValue({ count: 5 });

    await repo.markAllAsRead('user-42');

    expect((mockPrisma as any).notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-42', isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
});

describe('PaginatedResult structure', () => {
  it('should have correct structure type', () => {
    const result: PaginatedResult<{ id: string }> = {
      data: [{ id: '1' }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
  });
});

describe('Transaction helper', () => {
  it('should call $transaction on the client', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation((fn, _opts) => fn({})),
    };

    await withTx(mockClient as any, async (_tx) => {
      return 'result';
    });

    expect(mockClient.$transaction).toHaveBeenCalled();
  });

  it('should pass options to $transaction', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation((fn, _opts) => fn({})),
    };

    await withTx(mockClient as any, async (_tx) => 'result', { timeout: 5000 });

    expect(mockClient.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
  });

  it('should propagate the return value from the transaction callback', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation((fn, _opts) => fn({})),
    };

    const result = await withTx(mockClient as any, async (_tx) => {
      return { id: 'created-id', name: 'test' };
    });

    expect(result).toEqual({ id: 'created-id', name: 'test' });
  });
});
