import { describe, it, expect, beforeEach } from 'vitest';
import { AICaptionService } from '../../services/creator-tools/ai-caption.service';

describe('AICaptionService', () => {
  let service: AICaptionService;

  beforeEach(() => {
    service = new AICaptionService();
  });

  describe('transcribe', () => {
    it('returns transcription with segments', async () => {
      const result = await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      expect(result.id).toBeDefined();
      expect(result.videoId).toBe('video-1');
      expect(result.language).toBe('en');
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('segments have start, end, text, and confidence', async () => {
      const result = await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      for (const seg of result.segments) {
        expect(typeof seg.start).toBe('number');
        expect(typeof seg.end).toBe('number');
        expect(seg.end).toBeGreaterThan(seg.start);
        expect(seg.text.length).toBeGreaterThan(0);
        expect(seg.confidence).toBeGreaterThan(0);
        expect(seg.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('respects the language parameter', async () => {
      const result = await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        language: 'fr',
      });

      expect(result.language).toBe('fr');
    });

    it('rejects invalid videoId', async () => {
      await expect(
        service.transcribe({
          videoId: '',
          videoUrl: 'https://cdn.example.com/video.mp4',
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid videoUrl', async () => {
      await expect(
        service.transcribe({
          videoId: 'video-1',
          videoUrl: 'invalid',
        }),
      ).rejects.toThrow();
    });
  });

  describe('translate', () => {
    it('translates segments to target language', async () => {
      const transcription = await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      const translation = await service.translate({
        transcriptionId: transcription.id,
        targetLanguage: 'es',
      });

      expect(translation.language).toBe('es');
      expect(translation.segments.length).toBe(transcription.segments.length);

      for (const seg of translation.segments) {
        expect(seg.text).toContain('[es]');
      }
    });

    it('throws for non-existent transcription', async () => {
      await expect(
        service.translate({
          transcriptionId: 'nonexistent',
          targetLanguage: 'es',
        }),
      ).rejects.toThrow('Transcription not found');
    });

    it('rejects empty targetLanguage', async () => {
      await expect(
        service.translate({
          transcriptionId: 'some-id',
          targetLanguage: '',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getCaptions', () => {
    it('returns all transcriptions for a video', async () => {
      await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        language: 'en',
      });

      await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        language: 'fr',
      });

      const captions = await service.getCaptions('video-1');
      expect(captions).toHaveLength(2);
    });

    it('returns empty array for video with no transcriptions', async () => {
      const captions = await service.getCaptions('no-video');
      expect(captions).toHaveLength(0);
    });

    it('rejects empty videoId', async () => {
      await expect(service.getCaptions('')).rejects.toThrow('Invalid videoId');
    });
  });

  describe('exportCaptions', () => {
    it('produces correct SRT format', async () => {
      await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      const srt = await service.exportCaptions({ videoId: 'video-1', format: 'srt' });

      // SRT must have numbered entries
      expect(srt).toContain('1\n');
      // SRT timestamps use comma separator
      expect(srt).toContain('-->');
      expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    });

    it('produces correct VTT format', async () => {
      await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      const vtt = await service.exportCaptions({ videoId: 'video-1', format: 'vtt' });

      expect(vtt).toMatch(/^WEBVTT/);
      // VTT timestamps use dot separator
      expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    it('produces correct TXT format', async () => {
      await service.transcribe({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      const txt = await service.exportCaptions({ videoId: 'video-1', format: 'txt' });

      // Plain text should not have timestamps
      expect(txt).not.toContain('-->');
      expect(txt).not.toContain('WEBVTT');
      expect(txt.length).toBeGreaterThan(0);
    });

    it('throws for video with no captions', async () => {
      await expect(service.exportCaptions({ videoId: 'no-video', format: 'srt' })).rejects.toThrow(
        'No captions found',
      );
    });

    it('rejects invalid videoId', async () => {
      await expect(service.exportCaptions({ videoId: '', format: 'srt' })).rejects.toThrow();
    });
  });
});
