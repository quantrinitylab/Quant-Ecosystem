// ============================================================================
// QuantAI — AgentLabs Voice Flow Engine Unit & Integration Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  validateVoiceFlowGraph,
  simulateFlowStep,
  VoiceFlowGraph,
} from '../services/voice-flow.service';

describe('AgentLabs Voice Flow Graph Engine', () => {
  const validGraph: VoiceFlowGraph = {
    id: 'flow-1',
    name: 'Customer Support Flow',
    entryNodeId: 'node-greeting',
    nodes: [
      {
        id: 'node-greeting',
        type: 'greeting',
        label: 'Welcome Greeting',
        config: { message: 'Hello! Thank you for calling QuantAI support.' },
      },
      {
        id: 'node-intent',
        type: 'intent',
        label: 'Intent Classifier',
        config: { prompt: 'How can I direct your call today? Say billing or support.' },
      },
      {
        id: 'node-hangup',
        type: 'hangup',
        label: 'End Call',
        config: { message: 'Thank you for calling. Goodbye!' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'node-greeting',
        targetNodeId: 'node-intent',
      },
      {
        id: 'edge-2',
        sourceNodeId: 'node-intent',
        targetNodeId: 'node-hangup',
        conditionLabel: 'billing',
      },
    ],
  };

  describe('validateVoiceFlowGraph', () => {
    it('catches missing or non-existent entry node', () => {
      const invalidGraph: VoiceFlowGraph = {
        ...validGraph,
        entryNodeId: 'non-existent-entry',
      };

      const result = validateVoiceFlowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true);
    });

    it('catches invalid edges referencing non-existent source or target nodes', () => {
      const invalidGraph: VoiceFlowGraph = {
        ...validGraph,
        edges: [
          ...validGraph.edges,
          {
            id: 'edge-invalid',
            sourceNodeId: 'node-intent',
            targetNodeId: 'ghost-node',
          },
        ],
      };

      const result = validateVoiceFlowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-existent target node'))).toBe(true);
    });

    it('passes validation with 0 errors for a valid flow graph', () => {
      const result = validateVoiceFlowGraph(validGraph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('simulateFlowStep', () => {
    it('steps through Greeting -> Intent -> Hangup with correct response texts', () => {
      // Step 1: Greeting node
      const step1 = simulateFlowStep(validGraph, 'node-greeting');
      expect(step1.nextNodeId).toBe('node-intent');
      expect(step1.responseText).toBe('Hello! Thank you for calling QuantAI support.');
      expect(step1.actionTriggered).toBe('greeting_spoken');

      // Step 2: Intent node with user input matching billing
      const step2 = simulateFlowStep(validGraph, step1.nextNodeId!, 'I need help with billing');
      expect(step2.nextNodeId).toBe('node-hangup');
      expect(step2.responseText).toBe('How can I direct your call today? Say billing or support.');
      expect(step2.actionTriggered).toBe('intent_classified');

      // Step 3: Hangup node
      const step3 = simulateFlowStep(validGraph, step2.nextNodeId!);
      expect(step3.nextNodeId).toBeNull();
      expect(step3.responseText).toBe('Thank you for calling. Goodbye!');
      expect(step3.actionTriggered).toBe('hangup_call');
    });
  });
});
