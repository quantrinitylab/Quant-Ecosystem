// ============================================================================
// Social Graph Package - Follower Manager
// ============================================================================
// Follow/unfollow operations, paginated follower/following lists, network
// growth tracking, graph event emission, and follow suggestions.
// ============================================================================

import { GraphStore } from './graph-store';
import { PathFinder } from './path-finder';
import {
  GraphEvent,
  GraphEventType,
  PaginatedResult,
  NetworkGrowthMetrics,
  FriendSuggestion,
  BatchResult,
  GraphEventListener,
} from '../types';

// ---------------------------------------------------------------------------
// Follower Manager Implementation
// ---------------------------------------------------------------------------

export class FollowerManager {
  private store: GraphStore;
  private pathFinder: PathFinder;
  private eventLog: GraphEvent[] = [];
  private eventListeners: GraphEventListener[] = [];
  private growthSnapshots: Map<string, NetworkGrowthMetrics[]> = new Map();
  private followerCounts: Map<string, number> = new Map();
  private followingCounts: Map<string, number> = new Map();
  private eventIdCounter: number = 0;
  private maxEventLogSize: number = 10000;

  constructor(store: GraphStore, pathFinder?: PathFinder) {
    this.store = store;
    this.pathFinder = pathFinder || new PathFinder(store);
  }

  // -------------------------------------------------------------------------
  // Follow/Unfollow Operations
  // -------------------------------------------------------------------------

  /** Execute a follow operation */
  follow(sourceId: string, targetId: string): boolean {
    if (!this.store.hasNode(sourceId) || !this.store.hasNode(targetId)) {
      return false;
    }

    if (sourceId === targetId) return false;

    // Check if already following
    if (this.store.hasEdge(sourceId, targetId)) {
      const existingEdge = this.store.getEdge(sourceId, targetId);
      if (existingEdge && existingEdge.type === 'follow') return false;
    }

    // Check if blocked
    if (this.store.isBlocked(targetId, sourceId)) return false;

    // Add the follow edge
    const edge = this.store.addEdge(sourceId, targetId, 'follow', 1.0);
    if (!edge) return false;

    // Update cached counts
    this.updateFollowerCount(targetId, 1);
    this.updateFollowingCount(sourceId, 1);

    // Emit follow event
    this.emitGraphEvent('follow', sourceId, targetId);

    return true;
  }

  /** Execute an unfollow operation */
  unfollow(sourceId: string, targetId: string): boolean {
    if (!this.store.hasEdge(sourceId, targetId)) return false;

    const edge = this.store.getEdge(sourceId, targetId);
    if (!edge || edge.type !== 'follow') return false;

    const removed = this.store.removeEdge(sourceId, targetId);
    if (!removed) return false;

    // Update cached counts
    this.updateFollowerCount(targetId, -1);
    this.updateFollowingCount(sourceId, -1);

    // Emit unfollow event
    this.emitGraphEvent('unfollow', sourceId, targetId);

    return true;
  }

  /** Block a user */
  block(sourceId: string, targetId: string): boolean {
    if (!this.store.hasNode(sourceId) || !this.store.hasNode(targetId)) return false;

    // Remove existing follow edges in both directions
    if (this.store.hasEdge(sourceId, targetId)) {
      const edge = this.store.getEdge(sourceId, targetId);
      if (edge && edge.type === 'follow') {
        this.unfollow(sourceId, targetId);
      }
    }
    if (this.store.hasEdge(targetId, sourceId)) {
      const edge = this.store.getEdge(targetId, sourceId);
      if (edge && edge.type === 'follow') {
        this.store.removeEdge(targetId, sourceId);
        this.updateFollowerCount(sourceId, -1);
        this.updateFollowingCount(targetId, -1);
      }
    }

    // Add block edge
    this.store.addEdge(sourceId, targetId, 'block', 0);
    this.emitGraphEvent('block', sourceId, targetId);

    return true;
  }

  /** Unblock a user */
  unblock(sourceId: string, targetId: string): boolean {
    const edge = this.store.getEdge(sourceId, targetId);
    if (!edge || edge.type !== 'block') return false;

    this.store.removeEdge(sourceId, targetId);
    this.emitGraphEvent('unblock', sourceId, targetId);

    return true;
  }

  /** Mute a user */
  mute(sourceId: string, targetId: string): boolean {
    if (!this.store.hasNode(sourceId) || !this.store.hasNode(targetId)) return false;
    this.store.addEdge(sourceId, targetId, 'mute', 0);
    this.emitGraphEvent('mute', sourceId, targetId);
    return true;
  }

  /** Unmute a user */
  unmute(sourceId: string, targetId: string): boolean {
    const edge = this.store.getEdge(sourceId, targetId);
    if (!edge || edge.type !== 'mute') return false;

    this.store.removeEdge(sourceId, targetId);
    this.emitGraphEvent('unmute', sourceId, targetId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Follower/Following Counts
  // -------------------------------------------------------------------------

  /** Get follower count for a node */
  getFollowerCount(nodeId: string): number {
    if (this.followerCounts.has(nodeId)) {
      return this.followerCounts.get(nodeId)!;
    }
    // Calculate from graph
    const followers = this.store.getInNeighbors(nodeId, {
      excludeBlocked: true,
      edgeTypes: ['follow'],
    });
    const count = followers.length;
    this.followerCounts.set(nodeId, count);
    return count;
  }

  /** Get following count for a node */
  getFollowingCount(nodeId: string): number {
    if (this.followingCounts.has(nodeId)) {
      return this.followingCounts.get(nodeId)!;
    }
    // Calculate from graph
    const following = this.store.getOutNeighbors(nodeId, {
      excludeBlocked: true,
      edgeTypes: ['follow'],
    });
    const count = following.length;
    this.followingCounts.set(nodeId, count);
    return count;
  }

  /** Update cached follower count */
  private updateFollowerCount(nodeId: string, delta: number): void {
    const current = this.followerCounts.get(nodeId) || this.getFollowerCount(nodeId);
    this.followerCounts.set(nodeId, Math.max(0, current + delta));
  }

  /** Update cached following count */
  private updateFollowingCount(nodeId: string, delta: number): void {
    const current = this.followingCounts.get(nodeId) || this.getFollowingCount(nodeId);
    this.followingCounts.set(nodeId, Math.max(0, current + delta));
  }

  // -------------------------------------------------------------------------
  // Paginated Lists
  // -------------------------------------------------------------------------

  /** Get paginated follower list */
  getFollowers(nodeId: string, cursor?: string, pageSize: number = 20): PaginatedResult<string> {
    const allFollowers = this.store.getInNeighbors(nodeId, {
      excludeBlocked: true,
      edgeTypes: ['follow'],
    });

    return this.paginate(allFollowers, cursor, pageSize);
  }

  /** Get paginated following list */
  getFollowing(nodeId: string, cursor?: string, pageSize: number = 20): PaginatedResult<string> {
    const allFollowing = this.store.getOutNeighbors(nodeId, {
      excludeBlocked: true,
      edgeTypes: ['follow'],
    });

    return this.paginate(allFollowing, cursor, pageSize);
  }

  /** Paginate a list of items */
  private paginate(
    items: string[],
    cursor?: string,
    pageSize: number = 20,
  ): PaginatedResult<string> {
    let startIndex = 0;

    if (cursor) {
      const cursorIndex = items.indexOf(cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const pageItems = items.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < items.length;
    const nextCursor = pageItems.length > 0 ? pageItems[pageItems.length - 1]! : null;

    return {
      items: pageItems,
      total: items.length,
      hasMore,
      cursor: nextCursor,
      pageSize,
    };
  }

  // -------------------------------------------------------------------------
  // Network Growth Tracking
  // -------------------------------------------------------------------------

  /** Take a growth snapshot for a node */
  takeGrowthSnapshot(nodeId: string): NetworkGrowthMetrics | null {
    if (!this.store.hasNode(nodeId)) return null;

    const followers = this.getFollowerCount(nodeId);
    const following = this.getFollowingCount(nodeId);
    const ratio = following > 0 ? followers / following : followers;

    const history = this.growthSnapshots.get(nodeId) || [];
    const previous = history[history.length - 1];
    const velocity = previous ? followers - previous.followers : 0;
    const acceleration = previous ? velocity - previous.velocity : 0;
    const projectedGrowth = followers + velocity * 7;

    const metrics: NetworkGrowthMetrics = {
      nodeId,
      date: Date.now(),
      followers,
      following,
      ratio,
      velocity,
      acceleration,
      projectedGrowth,
    };

    history.push(metrics);
    if (history.length > 365) {
      history.shift();
    }
    this.growthSnapshots.set(nodeId, history);

    return metrics;
  }

  /** Get growth history for a node */
  getGrowthHistory(nodeId: string): NetworkGrowthMetrics[] {
    return this.growthSnapshots.get(nodeId) || [];
  }

  /** Get follower/following ratio */
  getFollowRatio(nodeId: string): number {
    const followers = this.getFollowerCount(nodeId);
    const following = this.getFollowingCount(nodeId);
    return following > 0 ? followers / following : followers;
  }

  // -------------------------------------------------------------------------
  // Batch Operations
  // -------------------------------------------------------------------------

  /** Batch follow multiple targets */
  batchFollow(sourceId: string, targetIds: string[]): BatchResult {
    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const targetId of targetIds) {
      const result = this.follow(sourceId, targetId);
      if (result) {
        successful++;
      } else {
        failed++;
        errors.push({ id: targetId, error: 'Follow operation failed' });
      }
    }

    return { successful, failed, errors, duration: Date.now() - startTime };
  }

  /** Batch unfollow multiple targets */
  batchUnfollow(sourceId: string, targetIds: string[]): BatchResult {
    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const targetId of targetIds) {
      const result = this.unfollow(sourceId, targetId);
      if (result) {
        successful++;
      } else {
        failed++;
        errors.push({ id: targetId, error: 'Unfollow operation failed' });
      }
    }

    return { successful, failed, errors, duration: Date.now() - startTime };
  }

  // -------------------------------------------------------------------------
  // Follow Suggestions
  // -------------------------------------------------------------------------

  /** Get follow suggestions based on graph analysis */
  getFollowSuggestions(nodeId: string, limit: number = 20): FriendSuggestion[] {
    return this.pathFinder.getFriendSuggestions(nodeId, limit);
  }

  /** Check if source is following target */
  isFollowing(sourceId: string, targetId: string): boolean {
    const edge = this.store.getEdge(sourceId, targetId);
    return edge !== undefined && edge.type === 'follow';
  }

  /** Check if two users mutually follow each other */
  isMutualFollow(nodeA: string, nodeB: string): boolean {
    return this.isFollowing(nodeA, nodeB) && this.isFollowing(nodeB, nodeA);
  }

  // -------------------------------------------------------------------------
  // Event System
  // -------------------------------------------------------------------------

  /** Register an event listener */
  addEventListener(listener: GraphEventListener): void {
    this.eventListeners.push(listener);
  }

  /** Remove an event listener */
  removeEventListener(listener: GraphEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /** Get recent events */
  getRecentEvents(limit: number = 50): GraphEvent[] {
    return this.eventLog.slice(-limit);
  }

  /** Get events for a specific node */
  getNodeEvents(nodeId: string, limit: number = 50): GraphEvent[] {
    return this.eventLog
      .filter((e) => e.sourceNode === nodeId || e.targetNode === nodeId)
      .slice(-limit);
  }

  /** Emit a graph event */
  private emitGraphEvent(type: GraphEventType, sourceNode: string, targetNode: string): void {
    const event: GraphEvent = {
      id: `event_${++this.eventIdCounter}`,
      type,
      sourceNode,
      targetNode,
      timestamp: Date.now(),
      metadata: {},
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxEventLogSize / 2);
    }

    // Notify listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        // Swallow listener errors
      }
    }

    // Also emit on the store
    this.store.emitEvent(event);
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /** Get total event count */
  getTotalEventCount(): number {
    return this.eventIdCounter;
  }

  /** Get event counts by type */
  getEventCountsByType(): Map<GraphEventType, number> {
    const counts = new Map<GraphEventType, number>();
    for (const event of this.eventLog) {
      const current = counts.get(event.type) || 0;
      counts.set(event.type, current + 1);
    }
    return counts;
  }

  /** Clear follower count cache (force recalculation) */
  invalidateCountCache(): void {
    this.followerCounts.clear();
    this.followingCounts.clear();
  }
}
