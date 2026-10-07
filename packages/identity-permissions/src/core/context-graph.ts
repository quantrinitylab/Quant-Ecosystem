// ============================================================================
// Context Graph - Knowledge graph of resources and relationships
// ============================================================================

import type { ContextNode, ContextEdgeType, ResourceType } from '../types.js';

export class ContextGraph {
  private nodes: Map<string, ContextNode> = new Map();

  addNode(node: ContextNode): void {
    this.nodes.set(node.id, node);
  }

  // NOTE: Edges are bidirectional - addEdge creates symmetric links in both nodes.
  // This is correct for undirected relationships (e.g., "related-to", "shared-with")
  // but conflates semantics for directed relationships (e.g., "edited", "mentioned-in").
  // Supporting directed edge semantics would require a future enhancement with
  // asymmetric insertion or a reverse relationship type.
  addEdge(fromId: string, toId: string, relationship: ContextEdgeType): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return false;

    fromNode.relationships.push({ targetId: toId, relationship });
    toNode.relationships.push({ targetId: fromId, relationship });
    return true;
  }

  getNode(id: string): ContextNode | undefined {
    return this.nodes.get(id);
  }

  getEdgesByType(nodeId: string, edgeType: ContextEdgeType): ContextNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    const results: ContextNode[] = [];
    for (const edge of node.relationships) {
      if (edge.relationship === edgeType) {
        const target = this.nodes.get(edge.targetId);
        if (target) {
          results.push(target);
        }
      }
    }
    return results;
  }

  findPath(fromId: string, toId: string, maxDepth: number): ContextNode[] | null {
    if (fromId === toId) {
      const node = this.nodes.get(fromId);
      return node ? [node] : null;
    }

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
    visited.add(fromId);

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      if (item.path.length - 1 >= maxDepth) continue;

      const node = this.nodes.get(item.id);
      if (!node) continue;

      for (const edge of node.relationships) {
        if (visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);

        const newPath = [...item.path, edge.targetId];
        if (edge.targetId === toId) {
          return newPath
            .map((id) => this.nodes.get(id))
            .filter((n): n is ContextNode => n !== undefined);
        }

        queue.push({ id: edge.targetId, path: newPath });
      }
    }

    return null;
  }

  getNodesByMetadata(key: string, value: unknown, workspaceId: string): ContextNode[] {
    const results: ContextNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.workspaceId !== workspaceId) continue;
      if (node.metadata[key] === value) {
        results.push(node);
      }
    }
    return results;
  }

  getRelated(nodeId: string, depth: number = 1): ContextNode[] {
    const visited = new Set<string>();
    const result: ContextNode[] = [];
    const queue: { id: string; currentDepth: number }[] = [{ id: nodeId, currentDepth: 0 }];

    visited.add(nodeId);

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      if (item.currentDepth >= depth) continue;

      const node = this.nodes.get(item.id);
      if (!node) continue;

      for (const edge of node.relationships) {
        if (visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);

        const relatedNode = this.nodes.get(edge.targetId);
        if (relatedNode) {
          result.push(relatedNode);
          queue.push({ id: edge.targetId, currentDepth: item.currentDepth + 1 });
        }
      }
    }

    return result;
  }

  getByType(type: ResourceType, workspaceId: string): ContextNode[] {
    const results: ContextNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type && node.workspaceId === workspaceId) {
        results.push(node);
      }
    }
    return results;
  }

  search(query: string, workspaceId: string): ContextNode[] {
    const lowerQuery = query.toLowerCase();
    const results: ContextNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.workspaceId !== workspaceId) continue;
      const metadataStr = JSON.stringify(node.metadata).toLowerCase();
      if (metadataStr.includes(lowerQuery)) {
        results.push(node);
      }
    }
    return results;
  }

  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove edges pointing to this node from other nodes
    for (const otherNode of this.nodes.values()) {
      otherNode.relationships = otherNode.relationships.filter((e) => e.targetId !== nodeId);
    }

    return this.nodes.delete(nodeId);
  }
}
