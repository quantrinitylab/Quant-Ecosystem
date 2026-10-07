import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollaborationService } from '../services/collaboration.service';

function createMockPrisma() {
  return {
    editCollaborator: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    editComment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('CollaborationService', () => {
  let service: CollaborationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CollaborationService(prisma as never);
  });

  describe('inviteCollaborator', () => {
    it('lets the implicit owner (first actor) invite, persisting themselves as OWNER', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue(null); // requester has no row
      prisma.editCollaborator.count.mockResolvedValue(0); // no members yet -> implicit owner
      prisma.editCollaborator.create.mockResolvedValue({});
      prisma.editCollaborator.upsert.mockResolvedValue({
        userId: 'invitee',
        role: 'EDITOR',
        createdAt: new Date('2026-06-22T00:00:00Z'),
      });

      const member = await service.inviteCollaborator('proj-1', 'owner-1', {
        userId: 'invitee',
        role: 'editor',
      });

      // requester persisted as OWNER
      expect(prisma.editCollaborator.create).toHaveBeenCalledWith({
        data: { projectId: 'proj-1', userId: 'owner-1', role: 'OWNER' },
      });
      // invitee upserted with mapped uppercase role
      expect(prisma.editCollaborator.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { projectId: 'proj-1', userId: 'invitee', role: 'EDITOR' },
          update: { role: 'EDITOR' },
        }),
      );
      expect(member.role).toBe('editor'); // projected back to lowercase
    });

    it('forbids a viewer from inviting', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue({ role: 'VIEWER' });
      await expect(
        service.inviteCollaborator('proj-1', 'viewer-1', { userId: 'x', role: 'editor' }),
      ).rejects.toThrow('Only owners or editors can invite');
    });

    it('rejects an invalid role', async () => {
      await expect(
        service.inviteCollaborator('proj-1', 'owner-1', { userId: 'x', role: 'superadmin' }),
      ).rejects.toThrow('Invalid role');
    });
  });

  describe('listMembers', () => {
    it('denies a non-member when the project already has members', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue(null);
      prisma.editCollaborator.count.mockResolvedValue(2); // members exist, caller not one
      await expect(service.listMembers('proj-1', 'stranger')).rejects.toThrow('Not a collaborator');
    });

    it('projects rows to lowercase-role collaborator views', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue({ role: 'OWNER' });
      prisma.editCollaborator.findMany.mockResolvedValue([
        { userId: 'owner-1', role: 'OWNER', createdAt: new Date('2026-06-22T00:00:00Z') },
        { userId: 'ed-1', role: 'EDITOR', createdAt: new Date('2026-06-22T01:00:00Z') },
      ]);

      const members = await service.listMembers('proj-1', 'owner-1');
      expect(members.map((m) => m.role)).toEqual(['owner', 'editor']);
      expect(members[0]!.isOnline).toBe(false);
    });
  });

  describe('addComment', () => {
    it('persists a comment for a member', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue({ role: 'EDITOR' });
      prisma.editComment.create.mockResolvedValue({
        id: 'c1',
        projectId: 'proj-1',
        userId: 'ed-1',
        content: 'nice',
        resolved: false,
        createdAt: new Date('2026-06-22T00:00:00Z'),
      });

      const comment = await service.addComment('proj-1', 'ed-1', { content: '  nice  ' });

      expect(prisma.editComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: 'nice' }) }),
      );
      expect(comment.id).toBe('c1');
      expect(comment.replies).toEqual([]);
    });

    it('forbids a viewer from commenting', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue({ role: 'VIEWER' });
      await expect(service.addComment('proj-1', 'viewer-1', { content: 'hi' })).rejects.toThrow(
        'Viewers cannot comment',
      );
    });

    it('rejects an empty comment', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValue({ role: 'OWNER' });
      await expect(service.addComment('proj-1', 'owner-1', { content: '   ' })).rejects.toThrow(
        'content is required',
      );
    });
  });

  describe('removeCollaborator', () => {
    it('lets an owner remove a non-owner collaborator', async () => {
      // requester resolves as OWNER
      prisma.editCollaborator.findFirst
        .mockResolvedValueOnce({ userId: 'owner-1', role: 'OWNER' }) // resolveRole(requester)
        .mockResolvedValueOnce({ userId: 'editor-1', role: 'EDITOR' }); // target lookup
      prisma.editCollaborator.delete.mockResolvedValue({});
      const res = await service.removeCollaborator('proj-1', 'owner-1', 'editor-1');
      expect(res).toEqual({ success: true });
      expect(prisma.editCollaborator.delete).toHaveBeenCalledWith({
        where: { projectId_userId: { projectId: 'proj-1', userId: 'editor-1' } },
      });
    });

    it('forbids a non-owner from removing', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValueOnce({ userId: 'ed', role: 'EDITOR' });
      await expect(service.removeCollaborator('proj-1', 'ed', 'someone')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('never removes an owner', async () => {
      prisma.editCollaborator.findFirst
        .mockResolvedValueOnce({ userId: 'owner-1', role: 'OWNER' })
        .mockResolvedValueOnce({ userId: 'owner-2', role: 'OWNER' });
      await expect(
        service.removeCollaborator('proj-1', 'owner-1', 'owner-2'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('404s removing a non-collaborator', async () => {
      prisma.editCollaborator.findFirst
        .mockResolvedValueOnce({ userId: 'owner-1', role: 'OWNER' })
        .mockResolvedValueOnce(null);
      await expect(service.removeCollaborator('proj-1', 'owner-1', 'ghost')).rejects.toMatchObject({
        code: 'NOT_A_COLLABORATOR',
      });
    });
  });

  describe('resolveComment', () => {
    it('lets an editor resolve a comment in the project', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValueOnce({ userId: 'ed', role: 'EDITOR' });
      prisma.editComment.findFirst.mockResolvedValue({ id: 'cmt-1', projectId: 'proj-1' });
      prisma.editComment.update.mockResolvedValue({
        id: 'cmt-1',
        projectId: 'proj-1',
        userId: 'u',
        content: 'x',
        resolved: true,
        createdAt: new Date(),
      });
      const res = await service.resolveComment('proj-1', 'ed', 'cmt-1', true);
      expect(res.resolved).toBe(true);
    });

    it('forbids a viewer from resolving', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValueOnce({ userId: 'v', role: 'VIEWER' });
      await expect(service.resolveComment('proj-1', 'v', 'cmt-1', true)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('404s an unknown comment', async () => {
      prisma.editCollaborator.findFirst.mockResolvedValueOnce({ userId: 'owner-1', role: 'OWNER' });
      prisma.editComment.findFirst.mockResolvedValue(null);
      await expect(
        service.resolveComment('proj-1', 'owner-1', 'ghost', true),
      ).rejects.toMatchObject({
        code: 'COMMENT_NOT_FOUND',
      });
    });
  });
});
