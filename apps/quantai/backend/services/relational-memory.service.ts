// ============================================================================
// QuantAI — Layer 2 Relational Memory Service (Prisma-backed unified entities)
//
// Bridges relational entities (tasks, calendar events, drive files, contacts,
// CodeHub repositories) into a unified relational snapshot for Quanty.
// Uses structural Prisma clients with resilient in-memory fallback.
// ============================================================================

export interface RelationalContact {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  interactionCount?: number;
}

export interface RelationalEvent {
  id: string;
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  attendees?: string[];
}

export interface RelationalFile {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  updatedAt: Date | string;
}

export interface RelationalRepo {
  id: string;
  name: string;
  defaultBranch: string;
  visibility: string;
  updatedAt?: Date | string;
}

export interface UnifiedRelationalSnapshot {
  userId: string;
  upcomingEvents: RelationalEvent[];
  frequentContacts: RelationalContact[];
  recentFiles: RelationalFile[];
  repositories: RelationalRepo[];
  generatedAt: number;
}

export interface RelationalPrismaClient {
  contact?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalContact[]>;
  };
  event?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalEvent[]>;
  };
  calendarEvent?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalEvent[]>;
  };
  file?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalFile[]>;
  };
  driveFile?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalFile[]>;
  };
  repository?: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<RelationalRepo[]>;
  };
}

export class RelationalMemoryService {
  constructor(private readonly prisma?: RelationalPrismaClient) {}

  async getUpcomingEvents(userId: string, limit = 5): Promise<RelationalEvent[]> {
    const delegate = this.prisma?.event || this.prisma?.calendarEvent;
    if (delegate?.findMany) {
      try {
        return await delegate.findMany({
          where: { userId, startTime: { gte: new Date() } },
          orderBy: { startTime: 'asc' },
          take: limit,
        });
      } catch {
        // Fallback
      }
    }
    return [];
  }

  async getFrequentContacts(userId: string, limit = 5): Promise<RelationalContact[]> {
    if (this.prisma?.contact?.findMany) {
      try {
        return await this.prisma.contact.findMany({
          where: { userId },
          orderBy: { interactionCount: 'desc' },
          take: limit,
        });
      } catch {
        // Fallback
      }
    }
    return [];
  }

  async getRecentFiles(userId: string, limit = 5): Promise<RelationalFile[]> {
    const delegate = this.prisma?.file || this.prisma?.driveFile;
    if (delegate?.findMany) {
      try {
        return await delegate.findMany({
          where: { userId, isDeleted: false },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
      } catch {
        // Fallback
      }
    }
    return [];
  }

  async getRepositories(userId: string, limit = 5): Promise<RelationalRepo[]> {
    if (this.prisma?.repository?.findMany) {
      try {
        return await this.prisma.repository.findMany({
          where: { ownerId: userId, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
      } catch {
        // Fallback
      }
    }
    return [];
  }

  async getUnifiedSnapshot(userId: string, limit = 5): Promise<UnifiedRelationalSnapshot> {
    const [upcomingEvents, frequentContacts, recentFiles, repositories] = await Promise.all([
      this.getUpcomingEvents(userId, limit),
      this.getFrequentContacts(userId, limit),
      this.getRecentFiles(userId, limit),
      this.getRepositories(userId, limit),
    ]);

    return {
      userId,
      upcomingEvents,
      frequentContacts,
      recentFiles,
      repositories,
      generatedAt: Date.now(),
    };
  }
}
