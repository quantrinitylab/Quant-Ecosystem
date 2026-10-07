import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationBranchingService } from '../services/conversation-branching.service';

describe('ConversationBranchingService', () => {
  let service: ConversationBranchingService;

  beforeEach(() => {
    service = new ConversationBranchingService();
  });

  describe('branch', () => {
    it('should create a new branch', () => {
      const branch = service.branch('conv-1', 'msg-5', 'Alternative Path');
      expect(branch.id).toBeDefined();
      expect(branch.conversationId).toBe('conv-1');
      expect(branch.fromMessageId).toBe('msg-5');
      expect(branch.name).toBe('Alternative Path');
      expect(branch.parentBranchId).toBeNull();
    });

    it('should use default name if none provided', () => {
      const branch = service.branch('conv-1', 'msg-1');
      expect(branch.name).toContain('Branch');
    });

    it('should set parent branch to current active', () => {
      const b1 = service.branch('conv-1', 'msg-1', 'First');
      const b2 = service.branch('conv-1', 'msg-3', 'Second');
      expect(b2.parentBranchId).toBe(b1.id);
    });
  });

  describe('deleteBranch', () => {
    it('should delete a branch', () => {
      const branch = service.branch('conv-1', 'msg-1');
      expect(service.deleteBranch(branch.id)).toBe(true);
      expect(service.getBranches('conv-1')).toHaveLength(0);
    });

    it('should return false for non-existent branch', () => {
      expect(service.deleteBranch('fake')).toBe(false);
    });

    it('should revert to parent if deleting active branch', () => {
      const b1 = service.branch('conv-1', 'msg-1');
      service.branch('conv-1', 'msg-2');
      // b2 is now active, delete it
      const active = service.getActiveBranch('conv-1');
      service.deleteBranch(active!.id);
      expect(service.getActiveBranch('conv-1')?.id).toBe(b1.id);
    });
  });

  describe('getBranches', () => {
    it('should return all branches for a conversation', () => {
      service.branch('conv-1', 'msg-1');
      service.branch('conv-1', 'msg-2');
      service.branch('conv-2', 'msg-1');
      expect(service.getBranches('conv-1')).toHaveLength(2);
    });

    it('should return empty array for conversation with no branches', () => {
      expect(service.getBranches('nonexistent')).toHaveLength(0);
    });
  });

  describe('switchBranch', () => {
    it('should switch active branch', () => {
      const b1 = service.branch('conv-1', 'msg-1');
      service.branch('conv-1', 'msg-2');
      const switched = service.switchBranch(b1.id);
      expect(switched?.id).toBe(b1.id);
      expect(service.getActiveBranch('conv-1')?.id).toBe(b1.id);
    });

    it('should return null for non-existent branch', () => {
      expect(service.switchBranch('fake')).toBeNull();
    });
  });

  describe('getActiveBranch', () => {
    it('should return null if no branches exist', () => {
      expect(service.getActiveBranch('conv-1')).toBeNull();
    });

    it('should return the most recently created branch', () => {
      service.branch('conv-1', 'msg-1');
      const b2 = service.branch('conv-1', 'msg-2');
      expect(service.getActiveBranch('conv-1')?.id).toBe(b2.id);
    });
  });

  describe('renameBranch', () => {
    it('should rename a branch', () => {
      const branch = service.branch('conv-1', 'msg-1', 'Old Name');
      const renamed = service.renameBranch(branch.id, 'New Name');
      expect(renamed?.name).toBe('New Name');
    });

    it('should return null for non-existent branch', () => {
      expect(service.renameBranch('fake', 'name')).toBeNull();
    });
  });

  describe('getBranchHistory', () => {
    it('should return parent chain', () => {
      const b1 = service.branch('conv-1', 'msg-1');
      const b2 = service.branch('conv-1', 'msg-2');
      const b3 = service.branch('conv-1', 'msg-3');

      const history = service.getBranchHistory(b3.id);
      expect(history).toHaveLength(3);
      expect(history[0]?.id).toBe(b3.id);
      expect(history[1]?.id).toBe(b2.id);
      expect(history[2]?.id).toBe(b1.id);
    });

    it('should return single item for root branch', () => {
      const b1 = service.branch('conv-1', 'msg-1');
      const history = service.getBranchHistory(b1.id);
      expect(history).toHaveLength(1);
    });
  });
});
