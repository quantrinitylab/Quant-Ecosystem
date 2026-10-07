import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIDatingService } from '../services/ai-dating.service';
import type { AIEngine } from '@quant/ai';

describe('AIDatingService', () => {
  let service: AIDatingService;
  let mockAI: { infer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAI = { infer: vi.fn() };
    service = new AIDatingService(mockAI as unknown as AIEngine);
  });

  describe('writeBio', () => {
    it('returns a trimmed bio from the AI response', async () => {
      mockAI.infer.mockResolvedValue({
        content:
          'I love exploring night markets and finding hidden speakeasies.\nMy ideal weekend is a sunrise hike followed by a lazy brunch.\nLooking for someone who can keep up with my spontaneity.\n',
      });

      const result = await service.writeBio(
        {
          interests: ['night markets', 'hiking', 'brunch'],
          personality: 'spontaneous',
          vibe: 'adventurous',
        },
        'user-1',
      );

      expect(result).toEqual({
        bio: 'I love exploring night markets and finding hidden speakeasies.\nMy ideal weekend is a sunrise hike followed by a lazy brunch.\nLooking for someone who can keep up with my spontaneity.',
      });
      expect(mockAI.infer).toHaveBeenCalledOnce();
      expect(mockAI.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmax',
          feature: 'bio-writer',
          userId: 'user-1',
          temperature: 0.8,
        }),
      );
    });

    it('handles minimal input without optional fields', async () => {
      mockAI.infer.mockResolvedValue({
        content: 'A simple bio about enjoying life.\n',
      });

      const result = await service.writeBio({ interests: ['music', 'movies'] }, 'user-2');

      expect(result).toEqual({ bio: 'A simple bio about enjoying life.' });
      expect(mockAI.infer).toHaveBeenCalledOnce();
    });

    it('throws when input fails Zod validation', async () => {
      await expect(
        service.writeBio({ interests: 'not-an-array' } as never, 'user-1'),
      ).rejects.toThrow();
      expect(mockAI.infer).not.toHaveBeenCalled();
    });
  });

  describe('generateIcebreakers', () => {
    it('returns parsed icebreakers stripping numbering from AI response', async () => {
      mockAI.infer.mockResolvedValue({
        content:
          '1. So you also like night markets — any favorite spots in the city?\n2. Your hiking photo on the profile looks amazing, where was that taken?\n3. Brunch enthusiast here too — savory or sweet person?\n',
      });

      const result = await service.generateIcebreakers(
        {
          matchBio: 'I love hiking, brunch, and exploring night markets.',
          sharedInterests: ['night markets', 'hiking', 'brunch'],
          count: 3,
        },
        'user-1',
      );

      expect(result.icebreakers).toEqual([
        'So you also like night markets — any favorite spots in the city?',
        'Your hiking photo on the profile looks amazing, where was that taken?',
        'Brunch enthusiast here too — savory or sweet person?',
      ]);
      expect(mockAI.infer).toHaveBeenCalledOnce();
      expect(mockAI.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmax',
          feature: 'icebreakers',
          userId: 'user-1',
          temperature: 0.8,
        }),
      );
    });

    it('strips bullet-point formatting from AI response', async () => {
      mockAI.infer.mockResolvedValue({
        content:
          '- Hey, I see you are into photography too!\n* What kind of camera do you use?\n• Your travel shots are incredible.\n',
      });

      const result = await service.generateIcebreakers(
        {
          matchBio: 'Photographer and world traveler.',
          sharedInterests: ['photography'],
          count: 3,
        },
        'user-2',
      );

      expect(result.icebreakers).toEqual([
        'Hey, I see you are into photography too!',
        'What kind of camera do you use?',
        'Your travel shots are incredible.',
      ]);
    });

    it('returns only up to the requested count of icebreakers', async () => {
      mockAI.infer.mockResolvedValue({
        content:
          '1. Message one\n2. Message two\n3. Message three\n4. Message four\n5. Message five\n',
      });

      const result = await service.generateIcebreakers(
        {
          matchBio: 'Test bio.',
          count: 2,
        },
        'user-1',
      );

      expect(result.icebreakers).toHaveLength(2);
      expect(result.icebreakers).toEqual(['Message one', 'Message two']);
    });

    it('uses default count of 3 when count is not provided', async () => {
      mockAI.infer.mockResolvedValue({
        content: '1. A\n2. B\n3. C\n4. D\n',
      });

      const result = await service.generateIcebreakers(
        { matchBio: 'Test bio.', count: 3 },
        'user-1',
      );

      expect(result.icebreakers).toHaveLength(3);
    });

    it('filters out empty lines from the AI response', async () => {
      mockAI.infer.mockResolvedValue({
        content: '1. First message\n\n2. Second message\n\n\n',
      });

      const result = await service.generateIcebreakers(
        { matchBio: 'Test bio.', count: 2 },
        'user-1',
      );

      expect(result.icebreakers).toEqual(['First message', 'Second message']);
    });

    it('throws when input fails Zod validation', async () => {
      await expect(
        service.generateIcebreakers({ matchBio: 123 } as never, 'user-1'),
      ).rejects.toThrow();
      expect(mockAI.infer).not.toHaveBeenCalled();
    });
  });
});
