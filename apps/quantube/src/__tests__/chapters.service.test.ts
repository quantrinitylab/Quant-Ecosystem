import { describe, it, expect, beforeEach } from 'vitest';
import { ChaptersService } from '../services/chapters.service';

describe('ChaptersService', () => {
  let service: ChaptersService;

  beforeEach(() => {
    service = new ChaptersService();
  });

  describe('addChapter', () => {
    it('should add a chapter to a video', () => {
      const chapter = service.addChapter('video-1', 0, 'Introduction');
      expect(chapter.videoId).toBe('video-1');
      expect(chapter.timestamp).toBe(0);
      expect(chapter.title).toBe('Introduction');
      expect(chapter.id).toBeDefined();
    });

    it('should add multiple chapters to same video', () => {
      service.addChapter('video-1', 0, 'Intro');
      service.addChapter('video-1', 60, 'Chapter 1');
      const chapters = service.getChapters('video-1');
      expect(chapters).toHaveLength(2);
    });
  });

  describe('removeChapter', () => {
    it('should remove an existing chapter', () => {
      const chapter = service.addChapter('video-1', 0, 'Intro');
      const result = service.removeChapter('video-1', chapter.id);
      expect(result).toBe(true);
      expect(service.getChapters('video-1')).toHaveLength(0);
    });

    it('should return false for non-existent chapter', () => {
      expect(service.removeChapter('video-1', 'non-existent')).toBe(false);
    });

    it('should return false for non-existent video', () => {
      expect(service.removeChapter('non-existent', 'chapter-1')).toBe(false);
    });
  });

  describe('getChapters', () => {
    it('should return empty array for video with no chapters', () => {
      expect(service.getChapters('video-1')).toHaveLength(0);
    });

    it('should return all chapters for a video', () => {
      service.addChapter('video-1', 0, 'Intro');
      service.addChapter('video-1', 120, 'Main');
      service.addChapter('video-2', 0, 'Other');

      const chapters = service.getChapters('video-1');
      expect(chapters).toHaveLength(2);
    });
  });

  describe('findChapterAtTime', () => {
    it('should return null for video with no chapters', () => {
      expect(service.findChapterAtTime('video-1', 30)).toBeNull();
    });

    it('should find the current chapter at a given time', () => {
      service.addChapter('video-1', 0, 'Intro');
      service.addChapter('video-1', 60, 'Chapter 1');
      service.addChapter('video-1', 120, 'Chapter 2');

      const chapter = service.findChapterAtTime('video-1', 90);
      expect(chapter?.title).toBe('Chapter 1');
    });

    it('should return last chapter when time exceeds all timestamps', () => {
      service.addChapter('video-1', 0, 'Intro');
      service.addChapter('video-1', 60, 'Chapter 1');

      const chapter = service.findChapterAtTime('video-1', 999);
      expect(chapter?.title).toBe('Chapter 1');
    });

    it('should return null when time is before any chapter', () => {
      service.addChapter('video-1', 60, 'Chapter 1');
      const chapter = service.findChapterAtTime('video-1', 30);
      expect(chapter).toBeNull();
    });
  });

  describe('parseFromDescription', () => {
    it('should parse MM:SS format timestamps', () => {
      const description = '0:00 Introduction\n1:30 Main Topic\n5:45 Conclusion';
      const result = service.parseFromDescription(description);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ timestamp: 0, title: 'Introduction' });
      expect(result[1]).toEqual({ timestamp: 90, title: 'Main Topic' });
      expect(result[2]).toEqual({ timestamp: 345, title: 'Conclusion' });
    });

    it('should parse HH:MM:SS format timestamps', () => {
      const description = '1:00:00 Hour mark\n1:30:15 Later';
      const result = service.parseFromDescription(description);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ timestamp: 3600, title: 'Hour mark' });
      expect(result[1]).toEqual({ timestamp: 5415, title: 'Later' });
    });

    it('should return empty array for description with no timestamps', () => {
      const result = service.parseFromDescription('Just a regular description\nNo timestamps here');
      expect(result).toHaveLength(0);
    });

    it('should handle mixed content with timestamps', () => {
      const description = 'Check out this video!\n0:00 Start\nSome text\n2:30 Middle';
      const result = service.parseFromDescription(description);
      expect(result).toHaveLength(2);
    });
  });

  describe('reorderChapters', () => {
    it('should sort chapters by timestamp', () => {
      service.addChapter('video-1', 120, 'Third');
      service.addChapter('video-1', 0, 'First');
      service.addChapter('video-1', 60, 'Second');

      const sorted = service.reorderChapters('video-1');
      expect(sorted[0]?.title).toBe('First');
      expect(sorted[1]?.title).toBe('Second');
      expect(sorted[2]?.title).toBe('Third');
    });

    it('should return empty array for non-existent video', () => {
      expect(service.reorderChapters('non-existent')).toHaveLength(0);
    });
  });
});
