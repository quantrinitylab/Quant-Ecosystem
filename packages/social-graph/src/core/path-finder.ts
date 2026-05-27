// ============================================================================
// Social Graph Package - Path Finder
// ============================================================================
// BFS-based shortest path, bidirectional BFS, mutual connections,
// friend-of-friend suggestions, and six degrees of separation check.
// ============================================================================

import { GraphStore } from './graph-store';
import { PathResult, FriendSuggestion, MutualConnectionsResult } from '../types';

// ---------------------------------------------------------------------------
// Path Finder Implementation
// ---------------------------------------------------------------------------

export class PathFinder {
  private store: GraphStore;
  private defaultMaxDepth: number = 6;

  constructor(store: GraphStore) {
    this.store = store;
  }

  // -------------------------------------------------------------------------
  // BFS Shortest Path
  // -------------------------------------------------------------------------

  /** Find shortest path between two nodes using BFS */
  findShortestPath(source: string, target: string, maxDepth?: number): PathResult {
    const limit = maxDepth || this.defaultMaxDepth;

    if (source === target) {
      return { path: [source], distance: 0, exists: true, searchDepth: 0, nodesExplored: 1 };
    }

    if (!this.store.hasNode(source) || !this.store.hasNode(target)) {
      return { path: [], distance: -1, exists: false, searchDepth: 0, nodesExplored: 0 };
    }

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: Array<{ node: string; depth: number }> = [];
    let nodesExplored = 0;
    let maxSearchDepth = 0;

    visited.add(source);
    queue.push({ node: source, depth: 0 });

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      nodesExplored++;
      maxSearchDepth = Math.max(maxSearchDepth, depth);

      if (depth >= limit) continue;

      const neighbors = this.store.getOutNeighbors(node, { excludeBlocked: true });

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        // Privacy check: do not traverse through blocked edges
        if (!this.store.canTraverse(source, neighbor)) continue;

        visited.add(neighbor);
        parent.set(neighbor, node);

        if (neighbor === target) {
          const path = this.reconstructPath(parent, source, target);
          return {
            path,
            distance: path.length - 1,
            exists: true,
            searchDepth: depth + 1,
            nodesExplored,
          };
        }

        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }

    return { path: [], distance: -1, exists: false, searchDepth: maxSearchDepth, nodesExplored };
  }

  // -------------------------------------------------------------------------
  // Bidirectional BFS (Faster for Large Graphs)
  // -------------------------------------------------------------------------

  /** Find shortest path using bidirectional BFS for better performance */
  findShortestPathBidirectional(source: string, target: string, maxDepth?: number): PathResult {
    const limit = maxDepth || this.defaultMaxDepth;

    if (source === target) {
      return { path: [source], distance: 0, exists: true, searchDepth: 0, nodesExplored: 1 };
    }

    if (!this.store.hasNode(source) || !this.store.hasNode(target)) {
      return { path: [], distance: -1, exists: false, searchDepth: 0, nodesExplored: 0 };
    }

    // Forward search from source
    const forwardVisited = new Map<string, string | null>();
    const forwardQueue: Array<{ node: string; depth: number }> = [];
    forwardVisited.set(source, null);
    forwardQueue.push({ node: source, depth: 0 });

    // Backward search from target
    const backwardVisited = new Map<string, string | null>();
    const backwardQueue: Array<{ node: string; depth: number }> = [];
    backwardVisited.set(target, null);
    backwardQueue.push({ node: target, depth: 0 });

    let nodesExplored = 0;
    let maxSearchDepth = 0;
    const halfLimit = Math.ceil(limit / 2);

    while (forwardQueue.length > 0 || backwardQueue.length > 0) {
      // Expand forward frontier
      if (forwardQueue.length > 0) {
        const { node, depth } = forwardQueue.shift()!;
        nodesExplored++;
        maxSearchDepth = Math.max(maxSearchDepth, depth);

        if (depth < halfLimit) {
          const neighbors = this.store.getOutNeighbors(node, { excludeBlocked: true });
          for (const neighbor of neighbors) {
            if (forwardVisited.has(neighbor)) continue;
            if (!this.store.canTraverse(source, neighbor)) continue;

            forwardVisited.set(neighbor, node);

            if (backwardVisited.has(neighbor)) {
              const path = this.buildBidirectionalPath(
                forwardVisited,
                backwardVisited,
                neighbor,
                source,
                target,
              );
              return {
                path,
                distance: path.length - 1,
                exists: true,
                searchDepth: maxSearchDepth,
                nodesExplored,
              };
            }

            forwardQueue.push({ node: neighbor, depth: depth + 1 });
          }
        }
      }

      // Expand backward frontier
      if (backwardQueue.length > 0) {
        const { node, depth } = backwardQueue.shift()!;
        nodesExplored++;
        maxSearchDepth = Math.max(maxSearchDepth, depth);

        if (depth < halfLimit) {
          const neighbors = this.store.getInNeighbors(node, { excludeBlocked: true });
          for (const neighbor of neighbors) {
            if (backwardVisited.has(neighbor)) continue;
            if (!this.store.canTraverse(neighbor, target)) continue;

            backwardVisited.set(neighbor, node);

            if (forwardVisited.has(neighbor)) {
              const path = this.buildBidirectionalPath(
                forwardVisited,
                backwardVisited,
                neighbor,
                source,
                target,
              );
              return {
                path,
                distance: path.length - 1,
                exists: true,
                searchDepth: maxSearchDepth,
                nodesExplored,
              };
            }

            backwardQueue.push({ node: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return { path: [], distance: -1, exists: false, searchDepth: maxSearchDepth, nodesExplored };
  }

  // -------------------------------------------------------------------------
  // Six Degrees of Separation
  // -------------------------------------------------------------------------

  /** Check if two nodes are within six degrees of separation */
  checkSixDegrees(source: string, target: string): PathResult {
    return this.findShortestPath(source, target, 6);
  }

  /** Get the degree of separation between two nodes */
  getDegreeOfSeparation(source: string, target: string): number {
    const result = this.findShortestPath(source, target, 6);
    return result.exists ? result.distance : -1;
  }

  // -------------------------------------------------------------------------
  // Mutual Connections
  // -------------------------------------------------------------------------

  /** Find mutual connections between two nodes (set intersection) */
  findMutualConnections(nodeA: string, nodeB: string): MutualConnectionsResult {
    if (!this.store.hasNode(nodeA) || !this.store.hasNode(nodeB)) {
      return { connections: [], count: 0, strongConnections: [] };
    }

    const neighborsA = new Set(this.store.getOutNeighbors(nodeA, { excludeBlocked: true }));
    const neighborsB = new Set(this.store.getOutNeighbors(nodeB, { excludeBlocked: true }));

    // Also include incoming connections for bidirectional check
    const inNeighborsA = this.store.getInNeighbors(nodeA, { excludeBlocked: true });
    const inNeighborsB = this.store.getInNeighbors(nodeB, { excludeBlocked: true });

    for (const n of inNeighborsA) neighborsA.add(n);
    for (const n of inNeighborsB) neighborsB.add(n);

    // Set intersection
    const mutual: string[] = [];
    for (const node of neighborsA) {
      if (neighborsB.has(node) && node !== nodeA && node !== nodeB) {
        mutual.push(node);
      }
    }

    // Determine strong connections (connected to both with high edge weight)
    const strongConnections: string[] = [];
    for (const node of mutual) {
      const edgeA = this.store.getEdge(nodeA, node) || this.store.getEdge(node, nodeA);
      const edgeB = this.store.getEdge(nodeB, node) || this.store.getEdge(node, nodeB);
      const weightA = edgeA?.weight || 0;
      const weightB = edgeB?.weight || 0;

      if (weightA > 0.7 && weightB > 0.7) {
        strongConnections.push(node);
      }
    }

    return {
      connections: mutual,
      count: mutual.length,
      strongConnections,
    };
  }

  // -------------------------------------------------------------------------
  // Friend-of-Friend Suggestions
  // -------------------------------------------------------------------------

  /** Generate friend suggestions based on 2nd degree connections */
  getFriendSuggestions(nodeId: string, limit: number = 20): FriendSuggestion[] {
    if (!this.store.hasNode(nodeId)) return [];

    const directConnections = new Set(this.store.getOutNeighbors(nodeId, { excludeBlocked: true }));
    const inConnections = this.store.getInNeighbors(nodeId, { excludeBlocked: true });
    for (const n of inConnections) directConnections.add(n);

    // Score map for 2nd degree connections
    const suggestionScores = new Map<
      string,
      { mutualCount: number; totalWeight: number; sources: string[] }
    >();

    for (const friend of directConnections) {
      const friendNeighbors = this.store.getOutNeighbors(friend, { excludeBlocked: true });
      const friendInNeighbors = this.store.getInNeighbors(friend, { excludeBlocked: true });
      const allFriendConnections = new Set([...friendNeighbors, ...friendInNeighbors]);

      for (const candidate of allFriendConnections) {
        // Skip self, direct connections, and blocked nodes
        if (candidate === nodeId) continue;
        if (directConnections.has(candidate)) continue;
        if (!this.store.canTraverse(nodeId, candidate)) continue;

        const existing = suggestionScores.get(candidate) || {
          mutualCount: 0,
          totalWeight: 0,
          sources: [],
        };

        existing.mutualCount++;
        const edge = this.store.getEdge(friend, candidate) || this.store.getEdge(candidate, friend);
        existing.totalWeight += edge?.weight || 0.5;
        if (existing.sources.length < 5) {
          existing.sources.push(friend);
        }

        suggestionScores.set(candidate, existing);
      }
    }

    // Convert to sorted suggestions
    const suggestions: FriendSuggestion[] = [];
    for (const [candidateId, data] of suggestionScores) {
      const score = this.calculateSuggestionScore(data.mutualCount, data.totalWeight, candidateId);
      suggestions.push({
        nodeId: candidateId,
        mutualCount: data.mutualCount,
        score,
        reason: `${data.mutualCount} mutual connection${data.mutualCount > 1 ? 's' : ''}`,
        commonCommunities: [],
      });
    }

    // Sort by score descending and limit
    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Multi-Path Analysis
  // -------------------------------------------------------------------------

  /** Find all paths between two nodes up to a max depth */
  findAllPaths(source: string, target: string, maxDepth: number = 4): PathResult[] {
    if (!this.store.hasNode(source) || !this.store.hasNode(target)) return [];

    const results: PathResult[] = [];
    const currentPath: string[] = [source];
    const visited = new Set<string>([source]);

    this.dfsAllPaths(source, target, maxDepth, currentPath, visited, results);

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /** Find nodes reachable within N hops */
  findReachableNodes(source: string, maxHops: number = 3): Map<string, number> {
    const distances = new Map<string, number>();
    if (!this.store.hasNode(source)) return distances;

    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [];

    visited.add(source);
    queue.push({ node: source, depth: 0 });

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (depth > 0) {
        distances.set(node, depth);
      }

      if (depth >= maxHops) continue;

      const neighbors = this.store.getOutNeighbors(node, { excludeBlocked: true });
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        if (!this.store.canTraverse(source, neighbor)) continue;
        visited.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }

    return distances;
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /** Reconstruct path from parent map */
  private reconstructPath(parent: Map<string, string>, source: string, target: string): string[] {
    const path: string[] = [];
    let current: string | undefined = target;

    while (current !== undefined && current !== source) {
      path.unshift(current);
      current = parent.get(current);
    }

    if (current === source) {
      path.unshift(source);
    }

    return path;
  }

  /** Build path from bidirectional BFS meeting point */
  private buildBidirectionalPath(
    forwardVisited: Map<string, string | null>,
    backwardVisited: Map<string, string | null>,
    meetingPoint: string,
    _source: string,
    _target: string,
  ): string[] {
    // Build forward path (source -> meeting point)
    const forwardPath: string[] = [];
    let current: string | null = meetingPoint;
    while (current !== null) {
      forwardPath.unshift(current);
      current = forwardVisited.get(current) || null;
    }

    // Build backward path (meeting point -> target)
    const backwardPath: string[] = [];
    current = backwardVisited.get(meetingPoint) || null;
    while (current !== null) {
      backwardPath.push(current);
      current = backwardVisited.get(current) || null;
    }

    return [...forwardPath, ...backwardPath];
  }

  /** DFS helper for finding all paths */
  private dfsAllPaths(
    current: string,
    target: string,
    maxDepth: number,
    path: string[],
    visited: Set<string>,
    results: PathResult[],
  ): void {
    if (current === target) {
      results.push({
        path: [...path],
        distance: path.length - 1,
        exists: true,
        searchDepth: path.length - 1,
        nodesExplored: visited.size,
      });
      return;
    }

    if (path.length - 1 >= maxDepth) return;
    if (results.length >= 100) return; // Cap results

    const neighbors = this.store.getOutNeighbors(current, { excludeBlocked: true });
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      if (!this.store.canTraverse(current, neighbor)) continue;

      visited.add(neighbor);
      path.push(neighbor);
      this.dfsAllPaths(neighbor, target, maxDepth, path, visited, results);
      path.pop();
      visited.delete(neighbor);
    }
  }

  /** Calculate suggestion score based on mutual connections and weight */
  private calculateSuggestionScore(
    mutualCount: number,
    totalWeight: number,
    candidateId: string,
  ): number {
    // Weighted formula: mutual connections are primary signal
    const mutualScore = Math.min(mutualCount / 10, 1.0) * 60;
    const weightScore = Math.min(totalWeight / mutualCount, 1.0) * 25;
    const popularityScore = Math.min(this.store.getInDegree(candidateId) / 100, 1.0) * 15;

    return mutualScore + weightScore + popularityScore;
  }
}
