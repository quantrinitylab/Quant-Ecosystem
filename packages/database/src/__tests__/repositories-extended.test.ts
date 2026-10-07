import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository, userPublicSelect } from '../repositories/user.repository';
import { MessageRepository } from '../repositories/message.repository';
import { EmailRepository } from '../repositories/email.repository';
import { PostRepository } from '../repositories/post.repository';
import { MediaRepository } from '../repositories/media.repository';
import { AISessionRepository } from '../repositories/ai-session.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { withTx } from '../transaction';

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

describe('UserRepository - Extended', () => {
  let repo: UserRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new UserRepository(prisma as any);
  });

  it('findByEmail calls prisma.user.findUnique with email', async () => {
    const mockUser = { id: '1', email: 'test@test.com' };
    (prisma as any).user.findUnique.mockResolvedValue(mockUser);

    const result = await repo.findByEmail('test@test.com');
    expect(result).toEqual(mockUser);
    expect((prisma as any).user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@test.com' },
    });
  });

  it('findByUsername calls prisma.user.findUnique with username', async () => {
    const mockUser = { id: '1', username: 'testuser' };
    (prisma as any).user.findUnique.mockResolvedValue(mockUser);

    const result = await repo.findByUsername('testuser');
    expect(result).toEqual(mockUser);
    expect((prisma as any).user.findUnique).toHaveBeenCalledWith({
      where: { username: 'testuser' },
    });
  });

  it('findByPhone calls prisma.user.findFirst with phoneNumber', async () => {
    const mockUser = { id: '1', phoneNumber: '+1234567890' };
    (prisma as any).user.findFirst.mockResolvedValue(mockUser);

    const result = await repo.findByPhone('+1234567890');
    expect(result).toEqual(mockUser);
    expect((prisma as any).user.findFirst).toHaveBeenCalledWith({
      where: { phoneNumber: '+1234567890' },
    });
  });

  it('create calls prisma.user.create with data', async () => {
    const data = { email: 'new@test.com', username: 'newuser', passwordHash: 'hash' };
    (prisma as any).user.create.mockResolvedValue({ id: '1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('1');
    expect((prisma as any).user.create).toHaveBeenCalledWith({ data });
  });

  it('update calls prisma.user.update with id and data', async () => {
    const updated = { id: '1', displayName: 'Updated' };
    (prisma as any).user.update.mockResolvedValue(updated);

    const result = await repo.update('1', { displayName: 'Updated' });
    expect(result).toEqual(updated);
    expect((prisma as any).user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { displayName: 'Updated' },
    });
  });

  it('incrementFailedAttempts calls prisma with increment', async () => {
    (prisma as any).user.update.mockResolvedValue({ id: '1', failedLoginAttempts: 3 });

    await repo.incrementFailedAttempts('1');

    expect((prisma as any).user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { failedLoginAttempts: { increment: 1 } },
    });
  });

  it('findMany uses default pagination when no options provided', async () => {
    (prisma as any).user.findMany.mockResolvedValue([]);
    (prisma as any).user.count.mockResolvedValue(0);

    const result = await repo.findMany();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect((prisma as any).user.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: userPublicSelect,
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findMany handles last page correctly', async () => {
    (prisma as any).user.findMany.mockResolvedValue([{ id: '21' }]);
    (prisma as any).user.count.mockResolvedValue(21);

    const result = await repo.findMany({ page: 3, pageSize: 10 });
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
    expect(result.totalPages).toBe(3);
  });
});

describe('MessageRepository - Extended', () => {
  let repo: MessageRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new MessageRepository(prisma as any);
  });

  it('create calls prisma.message.create', async () => {
    const data = { content: 'Hello', conversationId: 'conv-1' };
    (prisma as any).message.create.mockResolvedValue({ id: 'm1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('m1');
    expect((prisma as any).message.create).toHaveBeenCalledWith({ data });
  });

  it('markAsRead calls conversationMember.updateMany', async () => {
    (prisma as any).conversationMember.updateMany.mockResolvedValue({ count: 1 });

    await repo.markAsRead('conv-1', 'user-1');

    expect((prisma as any).conversationMember.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', userId: 'user-1' },
      data: { lastReadAt: expect.any(Date) },
    });
  });

  it('getConversationsForUser returns conversations via members', async () => {
    const mockConversations = [
      { conversation: { id: 'conv-1', lastMessageAt: new Date() } },
      { conversation: { id: 'conv-2', lastMessageAt: new Date() } },
    ];
    (prisma as any).conversationMember.findMany.mockResolvedValue(mockConversations);

    const result = await repo.getConversationsForUser('user-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('conv-1');
    expect((prisma as any).conversationMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', leftAt: null },
      include: { conversation: true },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });
  });

  it('findByConversation uses default pagination', async () => {
    (prisma as any).message.findMany.mockResolvedValue([]);
    (prisma as any).message.count.mockResolvedValue(0);

    const result = await repo.findByConversation('conv-1');
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('findByConversation handles pagination correctly', async () => {
    (prisma as any).message.findMany.mockResolvedValue([{ id: 'm1' }]);
    (prisma as any).message.count.mockResolvedValue(101);

    const result = await repo.findByConversation('conv-1', { page: 2, pageSize: 50 });
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(true);
    expect(result.totalPages).toBe(3);
    expect((prisma as any).message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', isDeleted: false },
      skip: 50,
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('EmailRepository - Extended', () => {
  let repo: EmailRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new EmailRepository(prisma as any);
  });

  it('findByFolder returns paginated emails', async () => {
    const mockEmails = [{ id: 'e1', subject: 'Test' }];
    (prisma as any).email.findMany.mockResolvedValue(mockEmails);
    (prisma as any).email.count.mockResolvedValue(1);

    const result = await repo.findByFolder('user-1', 'inbox');
    expect(result.data).toEqual(mockEmails);
    expect(result.total).toBe(1);
    expect((prisma as any).email.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', folderId: 'inbox', deletedAt: null },
      skip: 0,
      take: 20,
      orderBy: { receivedAt: 'desc' },
    });
  });

  it('findByThread returns emails ordered by receivedAt asc', async () => {
    const mockEmails = [{ id: 'e1' }, { id: 'e2' }];
    (prisma as any).email.findMany.mockResolvedValue(mockEmails);

    const result = await repo.findByThread('user-1', 'thread-1');
    expect(result).toEqual(mockEmails);
    expect((prisma as any).email.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', threadId: 'thread-1', deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    });
  });

  it('create calls prisma.email.create', async () => {
    const data = { subject: 'Test', userId: 'user-1' };
    (prisma as any).email.create.mockResolvedValue({ id: 'e1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('e1');
  });

  it('markAsRead updates isRead to true', async () => {
    (prisma as any).email.update.mockResolvedValue({ id: 'e1', isRead: true });

    await repo.markAsRead('e1');

    expect((prisma as any).email.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { isRead: true },
    });
  });

  it('moveToFolder updates folderId', async () => {
    (prisma as any).email.update.mockResolvedValue({ id: 'e1', folderId: 'archive' });

    await repo.moveToFolder('e1', 'archive');

    expect((prisma as any).email.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { folderId: 'archive' },
    });
  });
});

describe('PostRepository - Extended', () => {
  let repo: PostRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new PostRepository(prisma as any);
  });

  it('findByUser returns paginated posts', async () => {
    const mockPosts = [{ id: 'p1', title: 'Test' }];
    (prisma as any).post.findMany.mockResolvedValue(mockPosts);
    (prisma as any).post.count.mockResolvedValue(1);

    const result = await repo.findByUser('user-1');
    expect(result.data).toEqual(mockPosts);
    expect((prisma as any).post.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      skip: 0,
      take: 20,
      orderBy: { publishedAt: 'desc' },
    });
  });

  it('findForFeed filters by PUBLIC visibility and APPROVED moderation', async () => {
    (prisma as any).post.findMany.mockResolvedValue([]);
    (prisma as any).post.count.mockResolvedValue(0);

    await repo.findForFeed();

    expect((prisma as any).post.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, visibility: 'PUBLIC', moderationStatus: 'APPROVED' },
      skip: 0,
      take: 20,
      orderBy: { publishedAt: 'desc' },
    });
  });

  it('create calls prisma.post.create', async () => {
    const data = { title: 'New Post', userId: 'user-1' };
    (prisma as any).post.create.mockResolvedValue({ id: 'p1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('p1');
  });

  it('incrementLikeCount calls update with increment', async () => {
    (prisma as any).post.update.mockResolvedValue({ id: 'p1', likeCount: 5 });

    await repo.incrementLikeCount('p1');

    expect((prisma as any).post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { likeCount: { increment: 1 } },
    });
  });
});

describe('MediaRepository - Extended', () => {
  let repo: MediaRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new MediaRepository(prisma as any);
  });

  it('findVideoById calls prisma.video.findUnique', async () => {
    const mockVideo = { id: 'v1', title: 'Test Video' };
    (prisma as any).video.findUnique.mockResolvedValue(mockVideo);

    const result = await repo.findVideoById('v1');
    expect(result).toEqual(mockVideo);
    expect((prisma as any).video.findUnique).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });

  it('findVideosByUser returns paginated videos', async () => {
    (prisma as any).video.findMany.mockResolvedValue([{ id: 'v1' }]);
    (prisma as any).video.count.mockResolvedValue(1);

    const result = await repo.findVideosByUser('user-1');
    expect(result.data).toHaveLength(1);
    expect((prisma as any).video.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      skip: 0,
      take: 20,
      orderBy: { publishedAt: 'desc' },
    });
  });

  it('createVideo calls prisma.video.create', async () => {
    const data = { title: 'New Video', userId: 'user-1' };
    (prisma as any).video.create.mockResolvedValue({ id: 'v1', ...data });

    const result = await repo.createVideo(data as any);
    expect(result.id).toBe('v1');
  });

  it('findPhotoById calls prisma.photo.findUnique', async () => {
    const mockPhoto = { id: 'ph1', url: 'http://example.com/photo.jpg' };
    (prisma as any).photo.findUnique.mockResolvedValue(mockPhoto);

    const result = await repo.findPhotoById('ph1');
    expect(result).toEqual(mockPhoto);
  });

  it('findPhotosByUser returns paginated photos', async () => {
    (prisma as any).photo.findMany.mockResolvedValue([]);
    (prisma as any).photo.count.mockResolvedValue(0);

    const result = await repo.findPhotosByUser('user-1');
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('createPhoto calls prisma.photo.create', async () => {
    const data = { url: 'http://example.com/photo.jpg', userId: 'user-1' };
    (prisma as any).photo.create.mockResolvedValue({ id: 'ph1', ...data });

    const result = await repo.createPhoto(data as any);
    expect(result.id).toBe('ph1');
  });

  it('findActiveStories filters by expiresAt > now', async () => {
    const mockStories = [{ id: 's1', expiresAt: new Date(Date.now() + 86400000) }];
    (prisma as any).story.findMany.mockResolvedValue(mockStories);

    const result = await repo.findActiveStories('user-1');
    expect(result).toEqual(mockStories);
    expect((prisma as any).story.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', expiresAt: { gt: expect.any(Date) } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('createStory calls prisma.story.create', async () => {
    const data = { userId: 'user-1', mediaUrl: 'http://example.com/story.jpg' };
    (prisma as any).story.create.mockResolvedValue({ id: 's1', ...data });

    const result = await repo.createStory(data as any);
    expect(result.id).toBe('s1');
  });
});

describe('AISessionRepository - Extended', () => {
  let repo: AISessionRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new AISessionRepository(prisma as any);
  });

  it('findByUser returns paginated sessions', async () => {
    const mockSessions = [{ id: 'ai-1', title: 'Chat 1' }];
    (prisma as any).aISession.findMany.mockResolvedValue(mockSessions);
    (prisma as any).aISession.count.mockResolvedValue(1);

    const result = await repo.findByUser('user-1');
    expect(result.data).toEqual(mockSessions);
    expect((prisma as any).aISession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      skip: 0,
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('create calls prisma.aISession.create', async () => {
    const data = { title: 'New Chat', userId: 'user-1' };
    (prisma as any).aISession.create.mockResolvedValue({ id: 'ai-1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('ai-1');
  });

  it('addMessage calls prisma.aIMessage.create', async () => {
    const data = { content: 'Hello AI', sessionId: 'ai-1', role: 'user' };
    (prisma as any).aIMessage.create.mockResolvedValue({ id: 'msg-1', ...data });

    const result = await repo.addMessage(data as any);
    expect(result.id).toBe('msg-1');
  });

  it('getSessionWithMessages includes messages ordered by createdAt', async () => {
    const mockSession = {
      id: 'ai-1',
      title: 'Chat',
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
    };
    (prisma as any).aISession.findUnique.mockResolvedValue(mockSession);

    const result = await repo.getSessionWithMessages('ai-1');
    expect(result).toEqual(mockSession);
    expect((prisma as any).aISession.findUnique).toHaveBeenCalledWith({
      where: { id: 'ai-1' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  });

  it('getSessionWithMessages returns null for non-existent session', async () => {
    (prisma as any).aISession.findUnique.mockResolvedValue(null);

    const result = await repo.getSessionWithMessages('nonexistent');
    expect(result).toBeNull();
  });
});

describe('NotificationRepository - Extended', () => {
  let repo: NotificationRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new NotificationRepository(prisma as any);
  });

  it('findByUser returns paginated notifications', async () => {
    const mockNotifications = [{ id: 'n1', message: 'Hello' }];
    (prisma as any).notification.findMany.mockResolvedValue(mockNotifications);
    (prisma as any).notification.count.mockResolvedValue(1);

    const result = await repo.findByUser('user-1');
    expect(result.data).toEqual(mockNotifications);
    expect((prisma as any).notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      skip: 0,
      take: 20,
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    });
  });

  it('create calls prisma.notification.create', async () => {
    const data = { userId: 'user-1', message: 'New notification' };
    (prisma as any).notification.create.mockResolvedValue({ id: 'n1', ...data });

    const result = await repo.create(data as any);
    expect(result.id).toBe('n1');
  });

  it('markAsRead updates notification with isRead and readAt', async () => {
    (prisma as any).notification.update.mockResolvedValue({ id: 'n1', isRead: true });

    await repo.markAsRead('n1');

    expect((prisma as any).notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('findByUser handles pagination correctly', async () => {
    (prisma as any).notification.findMany.mockResolvedValue([]);
    (prisma as any).notification.count.mockResolvedValue(50);

    const result = await repo.findByUser('user-1', { page: 3, pageSize: 10 });
    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(5);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(true);
    expect((prisma as any).notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      skip: 20,
      take: 10,
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    });
  });
});

describe('Transaction helper - Extended', () => {
  it('should propagate errors from callback', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation(async (fn) => {
        return fn({});
      }),
    };

    await expect(
      withTx(mockClient as any, async () => {
        throw new Error('Transaction failed');
      }),
    ).rejects.toThrow('Transaction failed');
  });

  it('should pass isolation level option', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation((fn, _opts) => fn({})),
    };

    await withTx(mockClient as any, async () => 'result', {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    });

    expect(mockClient.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    });
  });

  it('should handle async operations in callback', async () => {
    const mockClient = {
      $transaction: vi.fn().mockImplementation(async (fn) => fn({})),
    };

    const result = await withTx(mockClient as any, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return { success: true };
    });

    expect(result).toEqual({ success: true });
  });
});
