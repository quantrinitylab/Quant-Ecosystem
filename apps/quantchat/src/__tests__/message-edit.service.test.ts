import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageEditService } from '../services/message-edit.service';

describe('MessageEditService', () => {
  let service: MessageEditService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new MessageEditService({ editWindowMs: 10000, maxEdits: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerMessage', () => {
    it('should register a message for editing', () => {
      const msg = service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello world');
      expect(msg.id).toBe('msg-1');
      expect(msg.content).toBe('Hello world');
      expect(msg.isEdited).toBe(false);
      expect(msg.editHistory).toHaveLength(0);
    });
  });

  describe('editMessage', () => {
    it('should edit a message', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      const edited = service.editMessage('msg-1', 'Edited content', 'user-1');

      expect(edited.content).toBe('Edited content');
      expect(edited.isEdited).toBe(true);
      expect(edited.editedAt).toBeDefined();
    });

    it('should store edit history', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      service.editMessage('msg-1', 'First edit', 'user-1');
      service.editMessage('msg-1', 'Second edit', 'user-1');

      const history = service.getEditHistory('msg-1');
      expect(history).toHaveLength(2);
      expect(history[0]?.content).toBe('Original');
      expect(history[1]?.content).toBe('First edit');
    });

    it('should throw for non-existent message', () => {
      expect(() => {
        service.editMessage('non-existent', 'New content', 'user-1');
      }).toThrow('Message "non-existent" not found');
    });

    it('should throw when non-sender tries to edit', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      expect(() => {
        service.editMessage('msg-1', 'Edited', 'user-2');
      }).toThrow('Only the sender can edit their message');
    });

    it('should throw when edit window has expired', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      vi.advanceTimersByTime(15000);

      expect(() => {
        service.editMessage('msg-1', 'Edited', 'user-1');
      }).toThrow('Edit window has expired');
    });

    it('should throw when max edits reached', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      service.editMessage('msg-1', 'Edit 1', 'user-1');
      service.editMessage('msg-1', 'Edit 2', 'user-1');
      service.editMessage('msg-1', 'Edit 3', 'user-1');

      expect(() => {
        service.editMessage('msg-1', 'Edit 4', 'user-1');
      }).toThrow('Maximum of 3 edits allowed');
    });

    it('should throw for empty content', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      expect(() => {
        service.editMessage('msg-1', '', 'user-1');
      }).toThrow('Message content cannot be empty');
    });

    it('should throw for whitespace-only content', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      expect(() => {
        service.editMessage('msg-1', '   ', 'user-1');
      }).toThrow('Message content cannot be empty');
    });

    it('should return same message if content unchanged', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      const result = service.editMessage('msg-1', 'Original', 'user-1');
      expect(result.isEdited).toBe(false);
      expect(result.editHistory).toHaveLength(0);
    });

    it('should trim content', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      const edited = service.editMessage('msg-1', '  Trimmed  ', 'user-1');
      expect(edited.content).toBe('Trimmed');
    });
  });

  describe('isEditable', () => {
    it('should return true for editable message', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      expect(service.isEditable('msg-1')).toBe(true);
    });

    it('should return false for non-existent message', () => {
      expect(service.isEditable('non-existent')).toBe(false);
    });

    it('should return false after edit window', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      vi.advanceTimersByTime(15000);
      expect(service.isEditable('msg-1')).toBe(false);
    });

    it('should return false after max edits', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      service.editMessage('msg-1', 'Edit 1', 'user-1');
      service.editMessage('msg-1', 'Edit 2', 'user-1');
      service.editMessage('msg-1', 'Edit 3', 'user-1');

      expect(service.isEditable('msg-1')).toBe(false);
    });
  });

  describe('getEditHistory', () => {
    it('should return empty array for non-existent message', () => {
      expect(service.getEditHistory('non-existent')).toHaveLength(0);
    });

    it('should return empty array for unedited message', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      expect(service.getEditHistory('msg-1')).toHaveLength(0);
    });

    it('should return full edit history', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'V1');
      service.editMessage('msg-1', 'V2', 'user-1');
      service.editMessage('msg-1', 'V3', 'user-1');

      const history = service.getEditHistory('msg-1');
      expect(history).toHaveLength(2);
      expect(history[0]?.content).toBe('V1');
      expect(history[1]?.content).toBe('V2');
    });
  });

  describe('getOriginalContent', () => {
    it('should return original content', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Original');
      service.editMessage('msg-1', 'Edited', 'user-1');

      expect(service.getOriginalContent('msg-1')).toBe('Original');
    });

    it('should return current content if never edited', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      expect(service.getOriginalContent('msg-1')).toBe('Hello');
    });

    it('should return null for non-existent message', () => {
      expect(service.getOriginalContent('non-existent')).toBeNull();
    });
  });

  describe('getEditCount', () => {
    it('should return 0 for unedited message', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      expect(service.getEditCount('msg-1')).toBe(0);
    });

    it('should return correct count', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      service.editMessage('msg-1', 'Edit 1', 'user-1');
      service.editMessage('msg-1', 'Edit 2', 'user-1');
      expect(service.getEditCount('msg-1')).toBe(2);
    });

    it('should return 0 for non-existent message', () => {
      expect(service.getEditCount('non-existent')).toBe(0);
    });
  });

  describe('getEditedMessages', () => {
    it('should return edited messages for a conversation', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      service.registerMessage('msg-2', 'conv-1', 'user-1', 'World');
      service.registerMessage('msg-3', 'conv-2', 'user-1', 'Other');

      service.editMessage('msg-1', 'Edited hello', 'user-1');
      service.editMessage('msg-3', 'Edited other', 'user-1');

      const edited = service.getEditedMessages('conv-1');
      expect(edited).toHaveLength(1);
      expect(edited[0]?.id).toBe('msg-1');
    });
  });

  describe('getMessage', () => {
    it('should return message', () => {
      service.registerMessage('msg-1', 'conv-1', 'user-1', 'Hello');
      const msg = service.getMessage('msg-1');
      expect(msg?.id).toBe('msg-1');
    });

    it('should return null for non-existent message', () => {
      expect(service.getMessage('non-existent')).toBeNull();
    });
  });

  describe('config', () => {
    it('should return edit window', () => {
      expect(service.getEditWindowMs()).toBe(10000);
    });

    it('should return max edits', () => {
      expect(service.getMaxEdits()).toBe(3);
    });
  });
});
