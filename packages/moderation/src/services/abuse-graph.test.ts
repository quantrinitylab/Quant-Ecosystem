import { describe, it, expect, beforeEach } from 'vitest';
import { AbuseGraphService } from './abuse-graph';

describe('AbuseGraphService', () => {
  let service: AbuseGraphService;

  beforeEach(() => {
    service = new AbuseGraphService({ clusterMinSize: 3, riskPropagationFactor: 0.5 });
  });

  describe('addNode', () => {
    it('should add a new node with signals', () => {
      const node = service.addNode('user-1', ['spam', 'fake_account']);
      expect(node.userId).toBe('user-1');
      expect(node.signals).toContain('spam');
      expect(node.signals).toContain('fake_account');
      expect(node.riskScore).toBeGreaterThan(0);
    });

    it('should update existing node with additional signals', () => {
      service.addNode('user-1', ['spam']);
      const updated = service.addNode('user-1', ['fake_account']);
      expect(updated.signals).toContain('spam');
      expect(updated.signals).toContain('fake_account');
    });

    it('should not duplicate signals', () => {
      service.addNode('user-1', ['spam']);
      const updated = service.addNode('user-1', ['spam']);
      expect(updated.signals.filter((s) => s === 'spam').length).toBe(1);
    });
  });

  describe('addEdge', () => {
    it('should add an edge between two nodes', () => {
      service.addNode('user-1');
      service.addNode('user-2');
      const edge = service.addEdge({
        fromUserId: 'user-1',
        toUserId: 'user-2',
        type: 'shared_ip',
      });
      expect(edge.fromUserId).toBe('user-1');
      expect(edge.toUserId).toBe('user-2');
      expect(edge.type).toBe('shared_ip');
      expect(edge.weight).toBe(1);
    });

    it('should auto-create nodes if they do not exist', () => {
      service.addEdge({
        fromUserId: 'user-a',
        toUserId: 'user-b',
        type: 'shared_device',
      });
      const related = service.getRelatedAccounts('user-a');
      expect(related).toContain('user-b');
    });

    it('should support custom weight', () => {
      const edge = service.addEdge({
        fromUserId: 'user-1',
        toUserId: 'user-2',
        type: 'coordinated_activity',
        weight: 0.7,
      });
      expect(edge.weight).toBe(0.7);
    });
  });

  describe('findClusters', () => {
    it('should find connected components with size >= minSize', () => {
      // Create a ring of 4 accounts
      service.addNode('a', ['spam']);
      service.addNode('b', ['spam']);
      service.addNode('c', ['spam']);
      service.addNode('d', ['spam']);
      service.addEdge({ fromUserId: 'a', toUserId: 'b', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'b', toUserId: 'c', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'c', toUserId: 'd', type: 'shared_ip' });

      const clusters = service.findClusters();
      expect(clusters.length).toBe(1);
      expect(clusters[0]!.memberIds.length).toBe(4);
      expect(clusters[0]!.memberIds).toContain('a');
      expect(clusters[0]!.memberIds).toContain('d');
    });

    it('should not return groups smaller than clusterMinSize', () => {
      service.addNode('x');
      service.addNode('y');
      service.addEdge({ fromUserId: 'x', toUserId: 'y', type: 'shared_device' });

      const clusters = service.findClusters();
      expect(clusters.length).toBe(0);
    });

    it('should find multiple clusters', () => {
      // Cluster 1: a-b-c
      service.addEdge({ fromUserId: 'a', toUserId: 'b', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'b', toUserId: 'c', type: 'shared_ip' });
      // Cluster 2: d-e-f
      service.addEdge({ fromUserId: 'd', toUserId: 'e', type: 'shared_device' });
      service.addEdge({ fromUserId: 'e', toUserId: 'f', type: 'shared_device' });

      const clusters = service.findClusters();
      expect(clusters.length).toBe(2);
    });

    it('should aggregate signals from all cluster members', () => {
      service.addNode('a', ['spam']);
      service.addNode('b', ['fake_account']);
      service.addNode('c', ['harassment']);
      service.addEdge({ fromUserId: 'a', toUserId: 'b', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'b', toUserId: 'c', type: 'shared_ip' });

      const clusters = service.findClusters();
      expect(clusters[0]!.signals).toContain('spam');
      expect(clusters[0]!.signals).toContain('fake_account');
      expect(clusters[0]!.signals).toContain('harassment');
    });
  });

  describe('getRelatedAccounts', () => {
    it('should return directly connected user IDs', () => {
      service.addEdge({ fromUserId: 'center', toUserId: 'n1', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'center', toUserId: 'n2', type: 'shared_device' });

      const related = service.getRelatedAccounts('center');
      expect(related).toContain('n1');
      expect(related).toContain('n2');
      expect(related.length).toBe(2);
    });

    it('should return empty array for unknown user', () => {
      const related = service.getRelatedAccounts('unknown');
      expect(related).toEqual([]);
    });
  });

  describe('getAccountRiskScore', () => {
    it('should return base risk for isolated nodes', () => {
      service.addNode('user-1', ['spam']);
      const score = service.getAccountRiskScore('user-1');
      expect(score).toBe(15); // 1 signal * 15
    });

    it('should include neighbor influence in risk score', () => {
      service.addNode('user-1', ['spam']);
      service.addNode('user-2', ['spam', 'fake_account', 'harassment']);
      service.addEdge({ fromUserId: 'user-1', toUserId: 'user-2', type: 'shared_ip' });

      const score = service.getAccountRiskScore('user-1');
      expect(score).toBeGreaterThan(15); // base risk + neighbor influence
    });

    it('should return 0 for unknown user', () => {
      expect(service.getAccountRiskScore('unknown')).toBe(0);
    });
  });

  describe('removeNode', () => {
    it('should remove node and its edges', () => {
      service.addEdge({ fromUserId: 'a', toUserId: 'b', type: 'shared_ip' });
      service.addEdge({ fromUserId: 'a', toUserId: 'c', type: 'shared_device' });

      const removed = service.removeNode('a');
      expect(removed).toBe(true);
      expect(service.getRelatedAccounts('a')).toEqual([]);
      expect(service.getRelatedAccounts('b')).not.toContain('a');
      expect(service.getRelatedAccounts('c')).not.toContain('a');
    });

    it('should return false for unknown node', () => {
      expect(service.removeNode('unknown')).toBe(false);
    });
  });
});
