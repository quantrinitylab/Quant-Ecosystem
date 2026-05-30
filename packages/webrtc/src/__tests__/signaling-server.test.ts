import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalingServer } from '../signaling-server.js';
import { RoomManager } from '../room-manager.js';
import type { ISocket } from '../types.js';

function createMockSocket(): ISocket & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(),
    readyState: 1,
  };
}

describe('SignalingServer', () => {
  let server: SignalingServer;
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
    server = new SignalingServer({ roomManager });
  });

  it('handleConnection registers socket', () => {
    const socket = createMockSocket();
    server.handleConnection(socket, 'user-1');
    expect(server.getConnectionCount()).toBe(1);
  });

  it('handleMessage with offer forwards to target peer', () => {
    const sender = createMockSocket();
    const receiver = createMockSocket();

    server.handleConnection(sender, 'user-1');
    server.handleConnection(receiver, 'user-2');

    server.handleMessage(
      'user-1',
      JSON.stringify({
        type: 'offer',
        roomId: 'room-1',
        fromId: 'user-1',
        toId: 'user-2',
        sdp: 'offer-sdp-data',
      }),
    );

    expect(receiver.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'offer',
        fromId: 'user-1',
        sdp: 'offer-sdp-data',
      }),
    );
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('handleMessage with answer forwards to target peer', () => {
    const sender = createMockSocket();
    const receiver = createMockSocket();

    server.handleConnection(sender, 'user-1');
    server.handleConnection(receiver, 'user-2');

    server.handleMessage(
      'user-2',
      JSON.stringify({
        type: 'answer',
        roomId: 'room-1',
        fromId: 'user-2',
        toId: 'user-1',
        sdp: 'answer-sdp-data',
      }),
    );

    expect(sender.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'answer',
        fromId: 'user-2',
        sdp: 'answer-sdp-data',
      }),
    );
  });

  it('handleMessage with ice-candidate forwards to target peer', () => {
    const sender = createMockSocket();
    const receiver = createMockSocket();

    server.handleConnection(sender, 'user-1');
    server.handleConnection(receiver, 'user-2');

    server.handleMessage(
      'user-1',
      JSON.stringify({
        type: 'ice-candidate',
        roomId: 'room-1',
        fromId: 'user-1',
        toId: 'user-2',
        candidate: {
          candidate: 'candidate-string',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      }),
    );

    expect(receiver.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'ice-candidate',
        fromId: 'user-1',
        candidate: {
          candidate: 'candidate-string',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      }),
    );
  });

  it('handleMessage with invalid JSON does not crash', () => {
    const socket = createMockSocket();
    server.handleConnection(socket, 'user-1');

    expect(() => server.handleMessage('user-1', 'not-valid-json{')).not.toThrow();
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'error', message: 'Invalid JSON' }),
    );
  });

  it('handleMessage with invalid schema sends error', () => {
    const socket = createMockSocket();
    server.handleConnection(socket, 'user-1');

    server.handleMessage('user-1', JSON.stringify({ type: 'offer' }));
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'error', message: 'Invalid message format' }),
    );
  });

  it('removeConnection cleans up', () => {
    const socket = createMockSocket();
    server.handleConnection(socket, 'user-1');
    expect(server.getConnectionCount()).toBe(1);
    server.removeConnection('user-1');
    expect(server.getConnectionCount()).toBe(0);
  });

  it('broadcastToRoom sends to all except excluded', () => {
    const s1 = createMockSocket();
    const s2 = createMockSocket();
    const s3 = createMockSocket();

    server.handleConnection(s1, 'user-1');
    server.handleConnection(s2, 'user-2');
    server.handleConnection(s3, 'user-3');

    roomManager.createRoom('room-1');
    roomManager.joinRoom('room-1', 'user-1');
    roomManager.joinRoom('room-1', 'user-2');
    roomManager.joinRoom('room-1', 'user-3');

    server.broadcastToRoom('room-1', { type: 'test' }, 'user-1');

    expect(s1.send).not.toHaveBeenCalled();
    expect(s2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
    expect(s3.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
  });

  it('sendToPeer returns false for unknown peer', () => {
    expect(server.sendToPeer('unknown', { type: 'test' })).toBe(false);
  });

  it('sendToPeer returns false for closed socket', () => {
    const socket = createMockSocket();
    socket.readyState = 3; // CLOSED
    server.handleConnection(socket, 'user-1');
    expect(server.sendToPeer('user-1', { type: 'test' })).toBe(false);
  });

  it('handleMessage join broadcasts participant-joined', () => {
    const s1 = createMockSocket();
    const s2 = createMockSocket();

    server.handleConnection(s1, 'user-1');
    server.handleConnection(s2, 'user-2');

    // user-1 joins first
    server.handleMessage(
      'user-1',
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        participantId: 'user-1',
      }),
    );

    // user-2 joins
    server.handleMessage(
      'user-2',
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        participantId: 'user-2',
      }),
    );

    // user-1 should receive participant-joined for user-2
    expect(s1.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'participant-joined', participantId: 'user-2' }),
    );
  });
});
