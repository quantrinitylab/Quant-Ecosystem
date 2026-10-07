// ============================================================================
// QuantAI — AgentLabs Node-Based Voice Agent Call Flow Service
// ============================================================================

export interface VoiceNode {
  id: string;
  type: 'greeting' | 'intent' | 'knowledge' | 'webhook' | 'transfer' | 'hangup';
  label: string;
  config: Record<string, any>;
}

export interface VoiceEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  conditionLabel?: string;
}

export interface VoiceFlowGraph {
  id: string;
  name: string;
  nodes: VoiceNode[];
  edges: VoiceEdge[];
  entryNodeId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SimulationResult {
  nextNodeId: string | null;
  responseText: string;
  actionTriggered?: string;
}

export function validateVoiceFlowGraph(graph: VoiceFlowGraph): ValidationResult {
  const errors: string[] = [];

  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { valid: false, errors: ['Invalid graph structure: nodes and edges arrays required'] };
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // 1. Verify entry node exists
  if (!graph.entryNodeId || !nodeIds.has(graph.entryNodeId)) {
    errors.push(`Entry node "${graph.entryNodeId}" does not exist in graph nodes.`);
  }

  // 2. Verify edges reference valid nodes
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push(`Edge "${edge.id}" references non-existent source node "${edge.sourceNodeId}".`);
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push(`Edge "${edge.id}" references non-existent target node "${edge.targetNodeId}".`);
    }
  }

  // If entry node is invalid, we can stop or continue
  if (errors.length > 0 && !graph.entryNodeId) {
    return { valid: false, errors };
  }

  // Build adjacency list for reachability and cycle detection
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    adj.set(n.id, []);
  }
  for (const edge of graph.edges) {
    const targets = adj.get(edge.sourceNodeId) || [];
    targets.push(edge.targetNodeId);
    adj.set(edge.sourceNodeId, targets);
  }

  // 3. Reachability analysis (BFS from entry)
  const reachable = new Set<string>();
  if (graph.entryNodeId && nodeIds.has(graph.entryNodeId)) {
    const queue = [graph.entryNodeId];
    reachable.add(graph.entryNodeId);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const next of adj.get(curr) || []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }

  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      errors.push(
        `Node "${node.id}" (${node.label}) is disconnected and unreachable from entry node.`,
      );
    }
  }

  // 4. Verify presence of at least one exit node (hangup or transfer) reachable from entry
  const exitNodes = graph.nodes.filter(
    (n) => (n.type === 'hangup' || n.type === 'transfer') && reachable.has(n.id),
  );
  if (exitNodes.length === 0) {
    errors.push('Graph must have at least one reachable exit node (hangup or transfer).');
  }

  // 5. Cycle detection and exit validation (DFS)
  // Check if any cycle exists without a path to an exit node
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfsHasExit(nodeId: string, visitedCycles: Set<string>): boolean {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (node.type === 'hangup' || node.type === 'transfer') return true;
    if (visitedCycles.has(nodeId)) return false; // Cycle detected without hitting exit so far from this branch

    visitedCycles.add(nodeId);
    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (dfsHasExit(neighbor, visitedCycles)) {
        visitedCycles.delete(nodeId);
        return true;
      }
    }
    visitedCycles.delete(nodeId);
    return false;
  }

  for (const nodeId of reachable) {
    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      // Check if there is a backedge (cycle)
      // If we do a cycle check:
      if (isPartofCycleWithoutExit(nodeId, neighbor, adj, graph, new Set())) {
        errors.push(`Cycle detected involving node "${nodeId}" without a valid exit path.`);
        break;
      }
    }
  }

  function isPartofCycleWithoutExit(
    startId: string,
    currId: string,
    adjacency: Map<string, string[]>,
    g: VoiceFlowGraph,
    seen: Set<string>,
  ): boolean {
    if (currId === startId) {
      // Found cycle! Check if any node in this cycle can reach an exit node.
      const cycleNodes = Array.from(seen);
      cycleNodes.push(startId);
      const canExit = cycleNodes.some((nId) => {
        const nd = g.nodes.find((x) => x.id === nId);
        if (nd && (nd.type === 'hangup' || nd.type === 'transfer')) return true;
        // Check if path to exit exists from nId
        return dfsHasExit(nId, new Set());
      });
      return !canExit;
    }
    if (seen.has(currId)) return false;
    seen.add(currId);
    for (const next of adjacency.get(currId) || []) {
      if (isPartofCycleWithoutExit(startId, next, adjacency, g, seen)) {
        seen.delete(currId);
        return true;
      }
    }
    seen.delete(currId);
    return false;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function simulateFlowStep(
  graph: VoiceFlowGraph,
  currentNodeId: string,
  userInput?: string,
): SimulationResult {
  const currentNode = graph.nodes.find((n) => n.id === currentNodeId);
  if (!currentNode) {
    return {
      nextNodeId: null,
      responseText: 'Error: Current node not found in graph.',
      actionTriggered: 'error',
    };
  }

  const outEdges = graph.edges.filter((e) => e.sourceNodeId === currentNodeId);

  switch (currentNode.type) {
    case 'greeting': {
      const responseText =
        currentNode.config.message || currentNode.label || 'Hello! Welcome to our voice service.';
      const nextNodeId = outEdges[0]?.targetNodeId || null;
      return {
        nextNodeId,
        responseText,
        actionTriggered: 'greeting_spoken',
      };
    }
    case 'intent': {
      let targetEdge = outEdges[0];
      if (userInput && outEdges.length > 1) {
        const lowerInput = userInput.toLowerCase();
        const matched = outEdges.find(
          (e) => e.conditionLabel && lowerInput.includes(e.conditionLabel.toLowerCase()),
        );
        if (matched) {
          targetEdge = matched;
        }
      }
      const responseText = currentNode.config.prompt || 'How can I assist you today?';
      const nextNodeId = targetEdge?.targetNodeId || null;
      return {
        nextNodeId,
        responseText,
        actionTriggered: userInput ? 'intent_classified' : 'awaiting_intent',
      };
    }
    case 'knowledge': {
      const responseText =
        currentNode.config.response ||
        (userInput
          ? `Here is what I found regarding "${userInput}": ${currentNode.config.defaultAnswer || 'Information retrieved successfully.'}`
          : 'Please tell me what you would like to know.');
      const nextNodeId = outEdges[0]?.targetNodeId || null;
      return {
        nextNodeId,
        responseText,
        actionTriggered: 'knowledge_queried',
      };
    }
    case 'webhook': {
      const actionName = currentNode.config.actionName || 'webhook_action';
      const responseText = currentNode.config.successMessage || 'Action executed successfully.';
      const nextNodeId = outEdges[0]?.targetNodeId || null;
      return {
        nextNodeId,
        responseText,
        actionTriggered: actionName,
      };
    }
    case 'transfer': {
      const responseText =
        currentNode.config.message || 'Transferring your call to an agent. Please hold.';
      return {
        nextNodeId: null,
        responseText,
        actionTriggered: 'transfer_call',
      };
    }
    case 'hangup': {
      const responseText = currentNode.config.message || 'Thank you for calling. Goodbye!';
      return {
        nextNodeId: null,
        responseText,
        actionTriggered: 'hangup_call',
      };
    }
    default: {
      return {
        nextNodeId: outEdges[0]?.targetNodeId || null,
        responseText: currentNode.label || 'Processing...',
        actionTriggered: 'default_step',
      };
    }
  }
}
