// ============================================================================
// Social Graph Package - Community Detector
// ============================================================================
// Label propagation algorithm for community detection, social circle
// classification, relationship strength calculation, and modularity scoring.
// ============================================================================

import { GraphStore } from './graph-store';
import {
  Community,
  SocialCircle,
  SocialCircleType,
  RelationshipStrength,
  StrengthFactors,
  StrengthConfig,
  CommunityDetectionConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Community Detector Implementation
// ---------------------------------------------------------------------------

export class CommunityDetector {
  private store: GraphStore;
  private config: CommunityDetectionConfig;
  private strengthConfig: StrengthConfig;
  private communities: Map<string, Community> = new Map();
  private nodeCommunityMap: Map<string, string> = new Map();
  private communityIdCounter: number = 0;

  constructor(
    store: GraphStore,
    config?: Partial<CommunityDetectionConfig>,
    strengthConfig?: Partial<StrengthConfig>,
  ) {
    this.store = store;
    this.config = {
      maxIterations: config?.maxIterations || 100,
      minCommunitySize: config?.minCommunitySize || 3,
      resolutionParameter: config?.resolutionParameter || 1.0,
      randomSeed: config?.randomSeed || 42,
    };
    this.strengthConfig = {
      frequencyWeight: strengthConfig?.frequencyWeight || 0.35,
      recencyWeight: strengthConfig?.recencyWeight || 0.25,
      typeWeight: strengthConfig?.typeWeight || 0.2,
      mutualityWeight: strengthConfig?.mutualityWeight || 0.1,
      durationWeight: strengthConfig?.durationWeight || 0.1,
      recencyDecayFactor: strengthConfig?.recencyDecayFactor || 0.01,
    };
  }

  // -------------------------------------------------------------------------
  // Label Propagation Algorithm
  // -------------------------------------------------------------------------

  /** Detect communities using label propagation */
  detectCommunities(): Community[] {
    const nodes = this.store.getAllNodeIds();
    if (nodes.length === 0) return [];

    // Step 1: Assign unique label to each node
    const labels = new Map<string, string>();
    for (const nodeId of nodes) {
      labels.set(nodeId, nodeId);
    }

    // Step 2: Iteratively propagate labels
    let iteration = 0;
    let changed = true;

    while (changed && iteration < this.config.maxIterations) {
      changed = false;
      iteration++;

      // Shuffle nodes for randomized order (deterministic using seed)
      const shuffled = this.shuffleArray([...nodes], this.config.randomSeed + iteration);

      for (const nodeId of shuffled) {
        const neighbors = this.store.getOutNeighbors(nodeId, { excludeBlocked: true });
        const inNeighbors = this.store.getInNeighbors(nodeId, { excludeBlocked: true });
        const allNeighbors = [...new Set([...neighbors, ...inNeighbors])];

        if (allNeighbors.length === 0) continue;

        // Count label frequencies among neighbors (weighted by edge weight)
        const labelCounts = new Map<string, number>();
        for (const neighbor of allNeighbors) {
          const neighborLabel = labels.get(neighbor);
          if (!neighborLabel) continue;

          const edge = this.store.getEdge(nodeId, neighbor) || this.store.getEdge(neighbor, nodeId);
          const weight = edge?.weight || 1.0;

          const currentCount = labelCounts.get(neighborLabel) || 0;
          labelCounts.set(neighborLabel, currentCount + weight);
        }

        // Find the most frequent label
        let maxCount = 0;
        let bestLabel = labels.get(nodeId)!;
        for (const [label, count] of labelCounts) {
          if (count > maxCount) {
            maxCount = count;
            bestLabel = label;
          } else if (count === maxCount && label < bestLabel) {
            // Tie-breaking: choose lexicographically smaller label
            bestLabel = label;
          }
        }

        // Update label if changed
        const currentLabel = labels.get(nodeId)!;
        if (bestLabel !== currentLabel) {
          labels.set(nodeId, bestLabel);
          changed = true;
        }
      }
    }

    // Step 3: Group nodes by label to form communities
    const communityMembers = new Map<string, string[]>();
    for (const [nodeId, label] of labels) {
      const members = communityMembers.get(label) || [];
      members.push(nodeId);
      communityMembers.set(label, members);
    }

    // Step 4: Filter by minimum size and create Community objects
    this.communities.clear();
    this.nodeCommunityMap.clear();
    const results: Community[] = [];

    for (const [, members] of communityMembers) {
      if (members.length < this.config.minCommunitySize) continue;

      const communityId = `community_${++this.communityIdCounter}`;
      const density = this.calculateCommunityDensity(members);
      const modularity = this.calculateCommunityModularity(members);

      const community: Community = {
        id: communityId,
        label: `Community ${this.communityIdCounter}`,
        members,
        density,
        modularity,
        cohesion: this.calculateCohesion(members),
        createdAt: Date.now(),
      };

      this.communities.set(communityId, community);
      for (const member of members) {
        this.nodeCommunityMap.set(member, communityId);
      }
      results.push(community);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Social Circle Classification
  // -------------------------------------------------------------------------

  /** Classify a node's connections into social circles */
  classifySocialCircles(nodeId: string): SocialCircle[] {
    if (!this.store.hasNode(nodeId)) return [];

    const connections = [
      ...this.store.getOutNeighbors(nodeId, { excludeBlocked: true }),
      ...this.store.getInNeighbors(nodeId, { excludeBlocked: true }),
    ];
    const uniqueConnections = [...new Set(connections)];

    // Calculate strength for each connection
    const strengths: Array<{ id: string; strength: RelationshipStrength }> = [];
    for (const connId of uniqueConnections) {
      const strength = this.calculateRelationshipStrength(nodeId, connId);
      strengths.push({ id: connId, strength });
    }

    // Sort by strength score
    strengths.sort((a, b) => b.strength.score - a.strength.score);

    // Classify into circles based on strength thresholds
    const circles: SocialCircle[] = [];

    const closeFriends: string[] = [];
    const acquaintances: string[] = [];
    const professional: string[] = [];

    for (const { id, strength } of strengths) {
      if (strength.score >= 0.7) {
        closeFriends.push(id);
      } else if (strength.score >= 0.3) {
        // Determine if professional based on interaction type
        const edge = this.store.getEdge(nodeId, id) || this.store.getEdge(id, nodeId);
        if (edge && edge.type === 'follow' && strength.factors.mutuality < 0.3) {
          professional.push(id);
        } else {
          acquaintances.push(id);
        }
      } else {
        acquaintances.push(id);
      }
    }

    if (closeFriends.length > 0) {
      circles.push(this.buildCircle('close_friends', closeFriends, strengths));
    }
    if (acquaintances.length > 0) {
      circles.push(this.buildCircle('acquaintances', acquaintances, strengths));
    }
    if (professional.length > 0) {
      circles.push(this.buildCircle('professional', professional, strengths));
    }

    return circles;
  }

  /** Build a social circle object */
  private buildCircle(
    type: SocialCircleType,
    members: string[],
    allStrengths: Array<{ id: string; strength: RelationshipStrength }>,
  ): SocialCircle {
    const memberSet = new Set(members);
    const relevantStrengths = allStrengths.filter((s) => memberSet.has(s.id));
    const avgStrength =
      relevantStrengths.length > 0
        ? relevantStrengths.reduce((sum, s) => sum + s.strength.score, 0) / relevantStrengths.length
        : 0;

    const avgFrequency =
      relevantStrengths.length > 0
        ? relevantStrengths.reduce((sum, s) => sum + s.strength.factors.frequency, 0) /
          relevantStrengths.length
        : 0;

    return {
      type,
      members,
      avgStrength,
      interactionFrequency: avgFrequency,
      lastActivity: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // Relationship Strength Calculation
  // -------------------------------------------------------------------------

  /** Calculate relationship strength between two nodes */
  calculateRelationshipStrength(sourceId: string, targetId: string): RelationshipStrength {
    const edge = this.store.getEdge(sourceId, targetId);
    const reverseEdge = this.store.getEdge(targetId, sourceId);

    const factors = this.computeStrengthFactors(sourceId, targetId, edge, reverseEdge);
    const score = this.computeWeightedStrength(factors);

    return {
      sourceId,
      targetId,
      score: Math.min(Math.max(score, 0), 1),
      factors,
      calculatedAt: Date.now(),
    };
  }

  /** Compute individual strength factors */
  private computeStrengthFactors(
    _sourceId: string,
    _targetId: string,
    edge: ReturnType<GraphStore['getEdge']>,
    reverseEdge: ReturnType<GraphStore['getEdge']>,
  ): StrengthFactors {
    const now = Date.now();

    // Frequency: normalized interaction count
    const interactionCount =
      (edge?.metadata.interactionCount || 0) + (reverseEdge?.metadata.interactionCount || 0);
    const frequency = Math.min(interactionCount / 100, 1.0);

    // Recency: exponential decay based on last interaction time
    const lastInteraction = Math.max(
      edge?.metadata.lastInteraction || 0,
      reverseEdge?.metadata.lastInteraction || 0,
    );
    const daysSinceInteraction =
      lastInteraction > 0 ? (now - lastInteraction) / (1000 * 60 * 60 * 24) : 365;
    const recency = Math.exp(-this.strengthConfig.recencyDecayFactor * daysSinceInteraction);

    // Type: value based on edge type (friend > follow > restrict)
    const typeValues: Record<string, number> = {
      friend: 1.0,
      follow: 0.6,
      restrict: 0.2,
      mute: 0.1,
      block: 0.0,
    };
    const edgeTypeValue = edge ? typeValues[edge.type] || 0.5 : 0;
    const reverseTypeValue = reverseEdge ? typeValues[reverseEdge.type] || 0.5 : 0;
    const type = Math.max(edgeTypeValue, reverseTypeValue);

    // Mutuality: whether the connection is bidirectional
    const mutuality = edge && reverseEdge ? 1.0 : 0.3;

    // Duration: how long the connection has existed
    const connectionAge = edge
      ? (now - edge.createdAt) / (1000 * 60 * 60 * 24 * 365) // years
      : 0;
    const duration = Math.min(connectionAge / 5, 1.0); // Cap at 5 years

    return { frequency, recency, type, mutuality, duration };
  }

  /** Compute weighted strength from factors */
  private computeWeightedStrength(factors: StrengthFactors): number {
    return (
      factors.frequency * this.strengthConfig.frequencyWeight +
      factors.recency * this.strengthConfig.recencyWeight +
      factors.type * this.strengthConfig.typeWeight +
      factors.mutuality * this.strengthConfig.mutualityWeight +
      factors.duration * this.strengthConfig.durationWeight
    );
  }

  // -------------------------------------------------------------------------
  // Community Density & Modularity
  // -------------------------------------------------------------------------

  /** Calculate density of a community (internal edges / possible edges) */
  calculateCommunityDensity(members: string[]): number {
    if (members.length < 2) return 0;

    const memberSet = new Set(members);
    let internalEdges = 0;

    for (const member of members) {
      const neighbors = this.store.getOutNeighbors(member, { excludeBlocked: true });
      for (const neighbor of neighbors) {
        if (memberSet.has(neighbor)) {
          internalEdges++;
        }
      }
    }

    const possibleEdges = members.length * (members.length - 1);
    return possibleEdges > 0 ? internalEdges / possibleEdges : 0;
  }

  /** Calculate modularity contribution of a community */
  calculateCommunityModularity(members: string[]): number {
    if (members.length === 0) return 0;

    const memberSet = new Set(members);
    const totalEdges = this.store.getEdgeCount();
    if (totalEdges === 0) return 0;

    let internalEdges = 0;
    let totalDegree = 0;

    for (const member of members) {
      const outNeighbors = this.store.getOutNeighbors(member, { excludeBlocked: true });
      totalDegree += outNeighbors.length;

      for (const neighbor of outNeighbors) {
        if (memberSet.has(neighbor)) {
          internalEdges++;
        }
      }
    }

    // Modularity Q = (internal edges / total edges) - (total degree / (2 * total edges))^2
    const edgeFraction = internalEdges / totalEdges;
    const degreeFraction = totalDegree / (2 * totalEdges);
    const modularity = edgeFraction - degreeFraction * degreeFraction;

    return modularity * this.config.resolutionParameter;
  }

  /** Calculate cohesion score for a group of nodes */
  private calculateCohesion(members: string[]): number {
    if (members.length < 2) return 0;

    const memberSet = new Set(members);
    let totalConnections = 0;
    let bidirectionalConnections = 0;

    for (const member of members) {
      const outNeighbors = this.store.getOutNeighbors(member, { excludeBlocked: true });
      for (const neighbor of outNeighbors) {
        if (memberSet.has(neighbor)) {
          totalConnections++;
          if (this.store.hasEdge(neighbor, member)) {
            bidirectionalConnections++;
          }
        }
      }
    }

    if (totalConnections === 0) return 0;
    return bidirectionalConnections / totalConnections;
  }

  /** Compute overall modularity score for all detected communities */
  computeOverallModularity(): number {
    if (this.communities.size === 0) return 0;

    let totalModularity = 0;
    for (const community of this.communities.values()) {
      totalModularity += this.calculateCommunityModularity(community.members);
    }

    return totalModularity;
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /** Get community for a specific node */
  getNodeCommunity(nodeId: string): Community | null {
    const communityId = this.nodeCommunityMap.get(nodeId);
    if (!communityId) return null;
    return this.communities.get(communityId) || null;
  }

  /** Get all detected communities */
  getAllCommunities(): Community[] {
    return Array.from(this.communities.values());
  }

  /** Get community by ID */
  getCommunityById(communityId: string): Community | null {
    return this.communities.get(communityId) || null;
  }

  /** Check if two nodes are in the same community */
  areInSameCommunity(nodeA: string, nodeB: string): boolean {
    const communityA = this.nodeCommunityMap.get(nodeA);
    const communityB = this.nodeCommunityMap.get(nodeB);
    return communityA !== undefined && communityA === communityB;
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /** Deterministic array shuffle using seed */
  private shuffleArray(array: string[], seed: number): string[] {
    let currentSeed = seed;
    const random = (): number => {
      currentSeed = (currentSeed * 1664525 + 1013904223) & 0xffffffff;
      return (currentSeed >>> 0) / 0xffffffff;
    };

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = array[i]!;
      array[i] = array[j]!;
      array[j] = temp;
    }
    return array;
  }
}
