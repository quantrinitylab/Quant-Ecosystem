// ============================================================================
// Phase 26 Hard Gate Validation Tests - Context Graph
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextGraph } from '../core/context-graph.js';
import type { ContextNode, ContextEdgeType, ResourceType } from '../types.js';

describe('Phase 26 Hard Gates - Context Graph', () => {
  let graph: ContextGraph;

  const createNode = (overrides: Partial<ContextNode> = {}): ContextNode => ({
    id: `node-${Math.random().toString(36).slice(2, 10)}`,
    type: 'doc',
    ownerId: 'user-1',
    workspaceId: 'ws-gate',
    metadata: {},
    relationships: [],
    ...overrides,
  });

  beforeEach(() => {
    graph = new ContextGraph();
  });

  // ==========================================================================
  // Gate A: All required node types
  // ==========================================================================
  describe('Gate A: All required node types', () => {
    const nodeTypeMappings: { description: string; type: ResourceType }[] = [
      { description: 'people (user-profile)', type: 'user-profile' },
      { description: 'conversations (message)', type: 'message' },
      { description: 'documents (doc)', type: 'doc' },
      { description: 'projects (task)', type: 'task' },
      { description: 'events (calendar-event)', type: 'calendar-event' },
    ];

    for (const { description, type } of nodeTypeMappings) {
      it(`can create and retrieve a node for ${description}`, () => {
        const node = createNode({
          id: `gate-node-${type}`,
          type,
          metadata: { name: `Test ${description}` },
        });

        graph.addNode(node);
        const retrieved = graph.getNode(node.id);

        expect(retrieved).toBeDefined();
        expect(retrieved!.type).toBe(type);
        expect(retrieved!.id).toBe(node.id);
      });
    }

    it('retrieves nodes by type within a workspace', () => {
      graph.addNode(createNode({ id: 'person-1', type: 'user-profile' }));
      graph.addNode(createNode({ id: 'person-2', type: 'user-profile' }));
      graph.addNode(createNode({ id: 'doc-1', type: 'doc' }));
      graph.addNode(createNode({ id: 'event-1', type: 'calendar-event' }));

      const profiles = graph.getByType('user-profile', 'ws-gate');
      expect(profiles).toHaveLength(2);

      const docs = graph.getByType('doc', 'ws-gate');
      expect(docs).toHaveLength(1);

      const events = graph.getByType('calendar-event', 'ws-gate');
      expect(events).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Gate B: All required edge types
  // ==========================================================================
  describe('Gate B: All required edge types', () => {
    const edgeTypes: ContextEdgeType[] = [
      'mentioned-in',
      'attended',
      'edited',
      'shared-with',
      'related-to',
    ];

    for (const edgeType of edgeTypes) {
      it(`supports edge type "${edgeType}"`, () => {
        const nodeA = createNode({ id: `edge-a-${edgeType}`, type: 'user-profile' });
        const nodeB = createNode({ id: `edge-b-${edgeType}`, type: 'doc' });

        graph.addNode(nodeA);
        graph.addNode(nodeB);

        const added = graph.addEdge(nodeA.id, nodeB.id, edgeType);
        expect(added).toBe(true);

        const results = graph.getEdgesByType(nodeA.id, edgeType);
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe(nodeB.id);
      });
    }

    it('getEdgesByType filters correctly when multiple edge types exist', () => {
      const person = createNode({ id: 'multi-edge-person', type: 'user-profile' });
      const doc1 = createNode({ id: 'multi-edge-doc1', type: 'doc' });
      const doc2 = createNode({ id: 'multi-edge-doc2', type: 'doc' });
      const event = createNode({ id: 'multi-edge-event', type: 'calendar-event' });

      graph.addNode(person);
      graph.addNode(doc1);
      graph.addNode(doc2);
      graph.addNode(event);

      graph.addEdge(person.id, doc1.id, 'edited');
      graph.addEdge(person.id, doc2.id, 'mentioned-in');
      graph.addEdge(person.id, event.id, 'attended');

      const edited = graph.getEdgesByType(person.id, 'edited');
      expect(edited).toHaveLength(1);
      expect(edited[0]!.id).toBe(doc1.id);

      const attended = graph.getEdgesByType(person.id, 'attended');
      expect(attended).toHaveLength(1);
      expect(attended[0]!.id).toBe(event.id);

      const mentionedIn = graph.getEdgesByType(person.id, 'mentioned-in');
      expect(mentionedIn).toHaveLength(1);
      expect(mentionedIn[0]!.id).toBe(doc2.id);
    });
  });

  // ==========================================================================
  // Gate C: Search grounding for agents
  // ==========================================================================
  describe('Gate C: Search grounding for agents', () => {
    let personA: ContextNode;
    let personB: ContextNode;
    let event: ContextNode;
    let document: ContextNode;

    beforeEach(() => {
      // Build a small graph:
      // personA -> attended -> event
      // personA -> mentioned-in -> document
      // document -> shared-with -> personB
      personA = createNode({
        id: 'agent-person-a',
        type: 'user-profile',
        metadata: { name: 'Alice Johnson', role: 'engineer' },
      });
      personB = createNode({
        id: 'agent-person-b',
        type: 'user-profile',
        metadata: { name: 'Bob Smith', role: 'designer' },
      });
      event = createNode({
        id: 'agent-event',
        type: 'calendar-event',
        metadata: { title: 'Design Review Meeting', date: '2024-03-15' },
      });
      document = createNode({
        id: 'agent-doc',
        type: 'doc',
        metadata: { title: 'Architecture Document', status: 'draft' },
      });

      graph.addNode(personA);
      graph.addNode(personB);
      graph.addNode(event);
      graph.addNode(document);

      graph.addEdge(personA.id, event.id, 'attended');
      graph.addEdge(personA.id, document.id, 'mentioned-in');
      graph.addEdge(document.id, personB.id, 'shared-with');
    });

    it('getRelated(personA, depth=2) traverses the graph to find related nodes', () => {
      const related = graph.getRelated(personA.id, 2);

      // At depth 1: event, document
      // At depth 2: personB (via document)
      expect(related.length).toBeGreaterThanOrEqual(3);
      const ids = related.map((n) => n.id);
      expect(ids).toContain(event.id);
      expect(ids).toContain(document.id);
      expect(ids).toContain(personB.id);
    });

    it('findPath(personA, personB) finds a path through the graph', () => {
      const path = graph.findPath(personA.id, personB.id, 5);

      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThanOrEqual(2);
      expect(path![0]!.id).toBe(personA.id);
      expect(path![path!.length - 1]!.id).toBe(personB.id);
    });

    it('search() finds nodes by metadata content', () => {
      const results = graph.search('Architecture', 'ws-gate');
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(document.id);
    });

    it('search() finds person by name in metadata', () => {
      const results = graph.search('Alice', 'ws-gate');
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(personA.id);
    });

    it('getNodesByMetadata finds nodes by specific metadata key-value', () => {
      const results = graph.getNodesByMetadata('role', 'engineer', 'ws-gate');
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(personA.id);
    });

    it('agent can ground understanding by combining graph traversal and search', () => {
      // Simulate: agent wants to find all context related to "Alice"
      // Step 1: Search for Alice
      const searchResults = graph.search('Alice', 'ws-gate');
      expect(searchResults).toHaveLength(1);
      const aliceNode = searchResults[0]!;

      // Step 2: Get related context at depth 2
      const context = graph.getRelated(aliceNode.id, 2);
      expect(context.length).toBeGreaterThanOrEqual(3);

      // Step 3: Find who else has access to Alice's documents
      const aliceDocs = graph.getEdgesByType(aliceNode.id, 'mentioned-in');
      expect(aliceDocs).toHaveLength(1);

      const docNode = aliceDocs[0]!;
      const sharedWith = graph.getEdgesByType(docNode.id, 'shared-with');
      expect(sharedWith).toHaveLength(1);
      expect(sharedWith[0]!.id).toBe(personB.id);
    });
  });
});
