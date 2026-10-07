// ============================================================================
// QuantTube - Chapters Service
// Manages video chapters, timestamps, and auto-parsing from descriptions
// ============================================================================

export interface Chapter {
  id: string;
  videoId: string;
  timestamp: number;
  title: string;
  thumbnailUrl?: string;
}

export class ChaptersService {
  private chapters: Map<string, Chapter[]> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `chapter-${this.idCounter}`;
  }

  addChapter(videoId: string, timestamp: number, title: string): Chapter {
    const chapter: Chapter = {
      id: this.generateId(),
      videoId,
      timestamp,
      title,
    };

    const videoChapters = this.chapters.get(videoId) ?? [];
    videoChapters.push(chapter);
    this.chapters.set(videoId, videoChapters);
    return chapter;
  }

  removeChapter(videoId: string, chapterId: string): boolean {
    const videoChapters = this.chapters.get(videoId);
    if (!videoChapters) {
      return false;
    }

    const index = videoChapters.findIndex((c) => c.id === chapterId);
    if (index === -1) {
      return false;
    }

    videoChapters.splice(index, 1);
    if (videoChapters.length === 0) {
      this.chapters.delete(videoId);
    }
    return true;
  }

  getChapters(videoId: string): Chapter[] {
    return [...(this.chapters.get(videoId) ?? [])];
  }

  findChapterAtTime(videoId: string, currentTime: number): Chapter | null {
    const videoChapters = this.chapters.get(videoId);
    if (!videoChapters || videoChapters.length === 0) {
      return null;
    }

    const sorted = [...videoChapters].sort((a, b) => a.timestamp - b.timestamp);
    let result: Chapter | null = null;

    for (const chapter of sorted) {
      if (chapter.timestamp <= currentTime) {
        result = chapter;
      } else {
        break;
      }
    }

    return result;
  }

  parseFromDescription(description: string): { timestamp: number; title: string }[] {
    const results: { timestamp: number; title: string }[] = [];
    const lines = description.split('\n');
    const timestampRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = timestampRegex.exec(trimmed);
      if (match) {
        const firstPart = parseInt(match[1] ?? '0', 10);
        const secondPart = parseInt(match[2] ?? '0', 10);
        const thirdPart = match[3] ? parseInt(match[3], 10) : undefined;
        const title = match[4] ?? '';

        let timestamp: number;
        if (thirdPart !== undefined) {
          // HH:MM:SS format
          timestamp = firstPart * 3600 + secondPart * 60 + thirdPart;
        } else {
          // MM:SS format
          timestamp = firstPart * 60 + secondPart;
        }

        results.push({ timestamp, title });
      }
    }

    return results;
  }

  reorderChapters(videoId: string): Chapter[] {
    const videoChapters = this.chapters.get(videoId);
    if (!videoChapters) {
      return [];
    }

    videoChapters.sort((a, b) => a.timestamp - b.timestamp);
    this.chapters.set(videoId, videoChapters);
    return [...videoChapters];
  }
}
