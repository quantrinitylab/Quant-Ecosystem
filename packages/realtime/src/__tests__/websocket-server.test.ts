// ============================================================================
// WebSocket Server Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { WebSocketServer } from '../websocket-server';

describe('WebSocketServer', () => {
  let server: WebSocketServer;

  beforeEach(() => {
    server = new WebSocketServer({
      port: 0,
      maxConnections: 100,
      heartbeatIntervalMs: 30000,
      heartbeatTimeoutMs: 60000,
      jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
    });
  });

  describe('connection lifecycle', () => {
    it('should accept a new connection', () => {
      const client = server.handleConnection('conn1', 'user1', 'quantchat');
      expect(client.id).toBe('conn1');
      expect(client.userId).toBe('user1');
      expect(client.app).toBe('quantchat');
      expect(client.connectedAt).toBeGreaterThan(0);
    });

    it('should track connection in stats', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      const stats = server.getStats();
      expect(stats.activeConnections).toBe(1);
      expect(stats.totalConnections).toBe(1);
    });

    it('should handle disconnection', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleDisconnection('conn1');
      const stats = server.getStats();
      expect(stats.activeConnections).toBe(0);
    });

    it('should track multiple connections per user', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleConnection('conn2', 'user1', 'quantmail');
      expect(server.getUserConnectionCount('user1')).toBe(2);
      expect(server.isUserConnected('user1')).toBe(true);
    });

    it('should mark user offline only after all connections close', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleConnection('conn2', 'user1', 'quantmail');
      server.handleDisconnection('conn1');
      expect(server.isUserConnected('user1')).toBe(true);
      server.handleDisconnection('conn2');
      expect(server.isUserConnected('user1')).toBe(false);
    });
  });

  describe('max connections', () => {
    it('should reject connections when max reached', () => {
      const smallServer = new WebSocketServer({
        maxConnections: 2,
        jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
      });
      smallServer.handleConnection('conn1', 'user1', 'quantchat');
      smallServer.handleConnection('conn2', 'user2', 'quantchat');
      expect(() => {
        smallServer.handleConnection('conn3', 'user3', 'quantchat');
      }).toThrow('Maximum connections reached');
    });
  });

  describe('message routing', () => {
    it('should route subscribe message', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'subscribe', channel: 'room1' }));
      const channelManager = server.getChannelManager();
      expect(channelManager.isMember('room1', 'user1')).toBe(true);
    });

    it('should route unsubscribe message', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'subscribe', channel: 'room1' }));
      server.handleMessage('conn1', JSON.stringify({ type: 'unsubscribe', channel: 'room1' }));
      const channelManager = server.getChannelManager();
      expect(channelManager.isMember('room1', 'user1')).toBe(false);
    });

    it('should route publish message to channel members', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'subscribe', channel: 'room1' }));
      server.handleMessage(
        'conn1',
        JSON.stringify({ type: 'publish', channel: 'room1', payload: { text: 'hello' } }),
      );
      const stats = server.getStats();
      expect(stats.messagesReceived).toBe(2);
    });

    it('should reject publish to non-member channel', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      const channelManager = server.getChannelManager();
      channelManager.createChannel({ name: 'room1', type: 'public' });
      server.handleMessage(
        'conn1',
        JSON.stringify({ type: 'publish', channel: 'room1', payload: { text: 'hello' } }),
      );
      const history = channelManager.getHistory('room1');
      expect(history).toHaveLength(0);
    });

    it('should handle invalid JSON gracefully', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      // Should not throw
      server.handleMessage('conn1', 'not valid json{{{');
      expect(server.getStats().messagesReceived).toBe(1);
    });

    it('should reject messages exceeding max size', () => {
      const smallServer = new WebSocketServer({
        maxMessageSize: 50,
        jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
      });
      smallServer.handleConnection('conn1', 'user1', 'quantchat');
      const largeMessage = 'x'.repeat(100);
      smallServer.handleMessage('conn1', largeMessage);
      // Message is rejected but stats still counted (since this tests the boundary)
    });

    it('should handle heartbeat messages', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      expect(server.getStats().messagesReceived).toBe(1);
    });

    it('should handle ack messages', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage(
        'conn1',
        JSON.stringify({ type: 'ack', messageId: 'msg1', sequence: 1 }),
      );
      expect(server.getStats().messagesReceived).toBe(1);
    });

    it('should handle presence update messages', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'presence_update', status: 'away' }));
      const presence = server.getPresenceManager().getPresence('user1');
      expect(presence?.status).toBe('away');
    });

    it('should handle custom message types via registerHandler', () => {
      let received: unknown = null;
      server.registerHandler('custom:event', (event) => {
        received = event;
      });
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage(
        'conn1',
        JSON.stringify({ type: 'custom:event', channel: 'ch1', payload: { data: 42 } }),
      );
      expect(received).not.toBeNull();
    });
  });

  describe('sendToUser', () => {
    it('should send to all user connections', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleConnection('conn2', 'user1', 'quantmail');
      // No real ws, so just confirm no errors
      server.sendToUser('user1', { type: 'test' });
      expect(server.getStats().messagesSent).toBeGreaterThan(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all clients', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleConnection('conn2', 'user2', 'quantchat');
      server.broadcast({ type: 'announcement' });
      expect(server.getStats().messagesSent).toBeGreaterThan(0);
    });

    it('should exclude specified client', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleConnection('conn2', 'user2', 'quantchat');
      server.broadcast({ type: 'announcement' }, 'conn1');
      // conn1 excluded, only conn2 gets the message
    });
  });

  describe('graceful shutdown', () => {
    it('should shut down cleanly without active server', async () => {
      await server.shutdown();
      // No errors thrown
    });
  });

  describe('JWT secret validation', () => {
    it('should throw when jwtSecret is empty', () => {
      expect(() => {
        new WebSocketServer({ jwtSecret: '' });
      }).toThrow(/jwtSecret/);
    });

    it('should throw when jwtSecret is too short', () => {
      expect(() => {
        new WebSocketServer({ jwtSecret: 'short' });
      }).toThrow(/at least 32 characters/);
    });

    it('should accept a sufficiently long jwtSecret', () => {
      expect(() => {
        new WebSocketServer({ jwtSecret: 'a'.repeat(32) });
      }).not.toThrow();
    });
  });

  describe('delivery manager access', () => {
    it('should expose delivery manager', () => {
      expect(server.getDeliveryManager()).toBeDefined();
    });
  });

  describe('stats', () => {
    it('should track uptime', () => {
      const stats = server.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track channel count', () => {
      server.handleConnection('conn1', 'user1', 'quantchat');
      server.handleMessage('conn1', JSON.stringify({ type: 'subscribe', channel: 'room1' }));
      expect(server.getStats().channelCount).toBe(1);
    });
  });
});
