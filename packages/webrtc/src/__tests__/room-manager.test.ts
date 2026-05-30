import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../room-manager.js';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('createRoom creates a room with a valid ID', () => {
    const room = manager.createRoom('test-room');
    expect(room.id).toBe('test-room');
    expect(room.participants.size).toBe(0);
    expect(room.maxParticipants).toBe(50);
  });

  it('createRoom generates an ID when not provided', () => {
    const room = manager.createRoom();
    expect(room.id).toBeDefined();
    expect(room.id.length).toBeGreaterThan(0);
  });

  it('createRoom throws when room already exists', () => {
    manager.createRoom('dup-room');
    expect(() => manager.createRoom('dup-room')).toThrow('Room dup-room already exists');
  });

  it('joinRoom adds participant to a room', () => {
    manager.createRoom('room-1');
    const participant = manager.joinRoom('room-1', 'user-1', 'Alice');
    expect(participant.id).toBe('user-1');
    expect(participant.displayName).toBe('Alice');
    expect(participant.audioMuted).toBe(false);
    expect(participant.videoMuted).toBe(false);
  });

  it('joinRoom auto-creates room if it does not exist', () => {
    const participant = manager.joinRoom('auto-room', 'user-1');
    expect(participant.id).toBe('user-1');
    expect(manager.getRoom('auto-room')).not.toBeNull();
  });

  it('joinRoom throws when room is full', () => {
    manager.createRoom('small-room', 2);
    manager.joinRoom('small-room', 'user-1');
    manager.joinRoom('small-room', 'user-2');
    expect(() => manager.joinRoom('small-room', 'user-3')).toThrow('is full');
  });

  it('joinRoom throws when participant already in room', () => {
    manager.createRoom('room-x');
    manager.joinRoom('room-x', 'user-1');
    expect(() => manager.joinRoom('room-x', 'user-1')).toThrow('already in room');
  });

  it('leaveRoom removes participant', () => {
    manager.createRoom('room-2');
    manager.joinRoom('room-2', 'user-1');
    manager.joinRoom('room-2', 'user-2');
    const removed = manager.leaveRoom('room-2', 'user-1');
    expect(removed).toBe(true);
    expect(manager.getRoomParticipants('room-2')).toHaveLength(1);
  });

  it('leaveRoom deletes room when empty', () => {
    manager.createRoom('room-3');
    manager.joinRoom('room-3', 'user-1');
    manager.leaveRoom('room-3', 'user-1');
    expect(manager.getRoom('room-3')).toBeNull();
  });

  it('leaveRoom returns false for nonexistent room', () => {
    expect(manager.leaveRoom('no-room', 'user-1')).toBe(false);
  });

  it('cleanupStaleRooms removes empty rooms', () => {
    manager.createRoom('empty-room');
    const cleaned = manager.cleanupStaleRooms(1000);
    expect(cleaned).toContain('empty-room');
    expect(manager.getRoom('empty-room')).toBeNull();
  });

  it('getStats returns correct counts', () => {
    manager.createRoom('room-a');
    manager.joinRoom('room-a', 'u1');
    manager.joinRoom('room-a', 'u2');
    manager.createRoom('room-b');
    manager.joinRoom('room-b', 'u3');
    const stats = manager.getStats();
    expect(stats.totalRooms).toBe(2);
    expect(stats.totalParticipants).toBe(3);
  });

  it('getRoomParticipants returns empty for nonexistent room', () => {
    expect(manager.getRoomParticipants('nope')).toEqual([]);
  });

  it('listRooms returns all active rooms', () => {
    manager.createRoom('r1');
    manager.createRoom('r2');
    expect(manager.listRooms()).toHaveLength(2);
  });
});
