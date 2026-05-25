export interface WatchHistoryEntry {
  id: string;
  userId: string;
  videoId: string;
  watchDuration: number;
  watchedAt: Date;
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

export class HistoryService {
  private history: WatchHistoryEntry[] = [];
  private idCounter = 0;

  async addToHistory(
    userId: string,
    videoId: string,
    watchDuration: number,
  ): Promise<WatchHistoryEntry> {
    this.idCounter++;
    const entry: WatchHistoryEntry = {
      id: `history-${this.idCounter}`,
      userId,
      videoId,
      watchDuration,
      watchedAt: new Date(),
    };

    // Update existing entry or add new one
    const existingIndex = this.history.findIndex(
      (h) => h.userId === userId && h.videoId === videoId,
    );

    if (existingIndex >= 0) {
      this.history[existingIndex] = entry;
    } else {
      this.history.push(entry);
    }

    return entry;
  }

  async getHistory(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<WatchHistoryEntry>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const userHistory = this.history
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

    const total = userHistory.length;
    const skip = (page - 1) * pageSize;
    const data = userHistory.slice(skip, skip + pageSize);
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

  async clearHistory(userId: string): Promise<void> {
    this.history = this.history.filter((h) => h.userId !== userId);
  }
}
