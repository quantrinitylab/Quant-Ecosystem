import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeService } from '../services/theme.service';

function createMockPrisma() {
  return {
    chatTheme: {
      findMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('ThemeService', () => {
  let service: ThemeService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ThemeService(prisma as never);
  });

  describe('setConversationTheme', () => {
    it('persists the themeId on the conversation (Requirement 14.3)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', themeId: null });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1', themeId: 'nebula' });

      const result = await service.setConversationTheme('conv-1', 'nebula');

      expect(result.themeId).toBe('nebula');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { themeId: 'nebula' },
      });
    });

    it('throws CONVERSATION_NOT_FOUND for a missing conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.setConversationTheme('missing', 'nebula')).rejects.toThrow(
        'Conversation not found',
      );
    });
  });

  describe('getConversationThemeId', () => {
    it('returns the stored theme id', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ themeId: 'quantum-void' });
      expect(await service.getConversationThemeId('conv-1')).toBe('quantum-void');
    });

    it('returns null when no theme is set', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ themeId: null });
      expect(await service.getConversationThemeId('conv-1')).toBeNull();
    });
  });

  describe('listThemes', () => {
    it('returns the predefined themes from the database', async () => {
      prisma.chatTheme.findMany.mockResolvedValue([{ id: 'nebula', name: 'Nebula' }]);
      const themes = await service.listThemes();
      expect(themes).toHaveLength(1);
    });
  });
});
