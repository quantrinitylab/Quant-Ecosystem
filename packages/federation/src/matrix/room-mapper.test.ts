import { describe, it, expect } from 'vitest';
import { RoomMapper } from './room-mapper.js';

describe('RoomMapper', () => {
  it('createMapping creates bidirectional lookup', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-1', '!room1:matrix.org', 'dm');

    expect(mapper.getMatrixRoom('conv-1')).toBe('!room1:matrix.org');
    expect(mapper.getQuantConversation('!room1:matrix.org')).toBe('conv-1');
  });

  it('getMatrixRoom returns correct room', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-2', '!room2:matrix.org', 'group');

    expect(mapper.getMatrixRoom('conv-2')).toBe('!room2:matrix.org');
    expect(mapper.getMatrixRoom('nonexistent')).toBeUndefined();
  });

  it('getQuantConversation returns correct conversation', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-3', '!room3:matrix.org', 'dm');

    expect(mapper.getQuantConversation('!room3:matrix.org')).toBe('conv-3');
    expect(mapper.getQuantConversation('!unknown:matrix.org')).toBeUndefined();
  });

  it('duplicate mapping throws', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-4', '!room4:matrix.org', 'dm');

    expect(() => mapper.createMapping('conv-4', '!room5:matrix.org', 'dm')).toThrow(
      'Mapping already exists',
    );
  });

  it('removeMapping cleans both directions', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-5', '!room5:matrix.org', 'group');

    mapper.removeMapping('conv-5');

    expect(mapper.getMatrixRoom('conv-5')).toBeUndefined();
    expect(mapper.getQuantConversation('!room5:matrix.org')).toBeUndefined();
  });
});
