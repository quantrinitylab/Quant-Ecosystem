import { describe, it, expect, vi } from 'vitest';
import {
  RelationalMemoryService,
  type RelationalPrismaClient,
} from '../services/relational-memory.service';

describe('RelationalMemoryService (Layer 2 Relational Memory)', () => {
  it('gracefully returns empty arrays when Prisma is unconfigured', async () => {
    const service = new RelationalMemoryService();
    const snapshot = await service.getUnifiedSnapshot('user-guest');

    expect(snapshot.userId).toBe('user-guest');
    expect(snapshot.upcomingEvents).toEqual([]);
    expect(snapshot.frequentContacts).toEqual([]);
    expect(snapshot.recentFiles).toEqual([]);
    expect(snapshot.repositories).toEqual([]);
    expect(snapshot.generatedAt).toBeGreaterThan(0);
  });

  it('aggregates relational entities into a unified snapshot with Prisma client', async () => {
    const mockEvents = [
      {
        id: 'ev-1',
        title: 'Product Sync',
        startTime: new Date('2026-09-15T10:00:00Z'),
        endTime: new Date('2026-09-15T11:00:00Z'),
        attendees: ['alice@quant.test'],
      },
    ];
    const mockContacts = [
      {
        id: 'c-1',
        name: 'Alice Developer',
        email: 'alice@quant.test',
        company: 'Quantrinity',
        interactionCount: 42,
      },
    ];
    const mockFiles = [
      {
        id: 'f-1',
        name: 'architecture-spec.pdf',
        size: 1048576,
        mimeType: 'application/pdf',
        updatedAt: new Date(),
      },
    ];
    const mockRepos = [
      {
        id: 'repo-1',
        name: 'quant-core',
        defaultBranch: 'main',
        visibility: 'public',
      },
    ];

    const mockPrisma: RelationalPrismaClient = {
      calendarEvent: {
        findMany: vi.fn(async () => mockEvents),
      },
      contact: {
        findMany: vi.fn(async () => mockContacts),
      },
      driveFile: {
        findMany: vi.fn(async () => mockFiles),
      },
      repository: {
        findMany: vi.fn(async () => mockRepos),
      },
    };

    const service = new RelationalMemoryService(mockPrisma);
    const snapshot = await service.getUnifiedSnapshot('user-real');

    expect(snapshot.userId).toBe('user-real');
    expect(snapshot.upcomingEvents).toHaveLength(1);
    expect(snapshot.upcomingEvents[0]?.title).toBe('Product Sync');
    expect(snapshot.frequentContacts).toHaveLength(1);
    expect(snapshot.frequentContacts[0]?.name).toBe('Alice Developer');
    expect(snapshot.recentFiles).toHaveLength(1);
    expect(snapshot.recentFiles[0]?.name).toBe('architecture-spec.pdf');
    expect(snapshot.repositories).toHaveLength(1);
    expect(snapshot.repositories[0]?.name).toBe('quant-core');
  });

  it('tolerates individual delegate database errors gracefully', async () => {
    const mockPrisma: RelationalPrismaClient = {
      calendarEvent: {
        findMany: vi.fn(async () => {
          throw new Error('DB connection timeout');
        }),
      },
      contact: {
        findMany: vi.fn(async () => [
          { id: 'c-2', name: 'Bob', email: 'bob@quant.test', interactionCount: 10 },
        ]),
      },
    };

    const service = new RelationalMemoryService(mockPrisma);
    const snapshot = await service.getUnifiedSnapshot('user-err');

    expect(snapshot.upcomingEvents).toEqual([]);
    expect(snapshot.frequentContacts).toHaveLength(1);
  });
});
