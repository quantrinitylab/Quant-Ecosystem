// ============================================================================
// QuantAI — AgentLabs Visual Voice Flow Builder Unit Test Suite
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createInitialVoiceGraph,
  calculateBezierCurve,
  addCanvasNode,
  connectCanvasNodes,
  simulateCanvasGraphStep,
  CanvasNode,
  CanvasEdge,
} from '../components/voice/VoiceFlowBuilder';

describe('AgentLabs Voice Flow Builder Canvas & Helpers', () => {
  it('createInitialVoiceGraph returns valid starter graph with greeting and hangup nodes', () => {
    const graph = createInitialVoiceGraph();
    expect(graph).toBeDefined();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.entryNodeId).toBeDefined();

    const greeting = graph.nodes.find((n) => n.type === 'greeting');
    const hangup = graph.nodes.find((n) => n.type === 'hangup');
    expect(greeting).toBeDefined();
    expect(hangup).toBeDefined();
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('addCanvasNode correctly appends new nodes with unique IDs and coordinates', () => {
    const initialNodes: CanvasNode[] = [
      { id: 'n1', type: 'greeting', label: 'Start', x: 100, y: 100, config: { message: 'Hello' } },
    ];

    const updated = addCanvasNode(initialNodes, 'intent', { x: 300, y: 150 }, 'Intent Check');
    expect(updated.length).toBe(2);
    expect(updated[1].type).toBe('intent');
    expect(updated[1].label).toBe('Intent Check');
    expect(updated[1].x).toBe(300);
    expect(updated[1].y).toBe(150);
    expect(updated[1].id).toBeDefined();
  });

  it('connectCanvasNodes connects two nodes with condition label and prevents duplicate edges', () => {
    const edges: CanvasEdge[] = [
      { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', conditionLabel: 'Start' },
    ];

    // Add new connection
    const updated = connectCanvasNodes(edges, 'n2', 'n3', 'support');
    expect(updated.length).toBe(2);
    expect(updated[1].sourceNodeId).toBe('n2');
    expect(updated[1].targetNodeId).toBe('n3');
    expect(updated[1].conditionLabel).toBe('support');

    // Attempt duplicate connection (should not add duplicate)
    const duplicate = connectCanvasNodes(updated, 'n2', 'n3', 'support');
    expect(duplicate.length).toBe(2);
  });

  it('calculateBezierCurve generates smooth cubic bezier SVG path string M x1 y1 C ... x2 y2', () => {
    const path = calculateBezierCurve(100, 150, 400, 300);
    expect(path).toMatch(/^M 100 150 C /);
    expect(path).toContain(' 400 300');
  });

  it('simulateCanvasGraphStep correctly transitions from Greeting to next connected node with prompt text', () => {
    const graph = createInitialVoiceGraph();
    const greetingNode = graph.nodes.find((n) => n.type === 'greeting')!;
    const stepResult = simulateCanvasGraphStep(graph.nodes, graph.edges, greetingNode.id);

    expect(stepResult).toBeDefined();
    expect(stepResult.responseText).toContain('Hello! Welcome to QuantAI');
    expect(stepResult.nextNodeId).toBeDefined();
    expect(stepResult.nextNodeId).not.toBeNull();
  });
});
