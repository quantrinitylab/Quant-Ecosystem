// ============================================================================
// QuantAI - useAutomation Hook
// Workflow state: nodes, connections, execution, history
// ============================================================================

import { useState, useCallback, useMemo } from 'react';

interface AutomationNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  name: string;
  icon: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
  status: 'idle' | 'running' | 'success' | 'error';
}

interface AutomationConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

interface ExecutionRecord {
  id: string;
  workflowId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'error' | 'partial' | 'running';
  nodesExecuted: number;
  totalNodes: number;
  duration: number;
  error?: string;
  nodeResults: Array<{ nodeId: string; status: string; output?: string }>;
}

interface UseAutomationOptions {
  workflowId?: string;
  autoSave?: boolean;
}

interface UseAutomationReturn {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
  selectedNode: AutomationNode | null;
  isRunning: boolean;
  isSaving: boolean;
  executionHistory: ExecutionRecord[];
  currentExecution: ExecutionRecord | null;
  addNode: (type: string, name: string, icon: string, x: number, y: number, config?: Record<string, any>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  updateNodeConfig: (id: string, config: Record<string, any>) => void;
  selectNode: (id: string | null) => void;
  addConnection: (sourceId: string, targetId: string) => void;
  removeConnection: (id: string) => void;
  executeWorkflow: () => Promise<void>;
  stopExecution: () => void;
  saveWorkflow: () => void;
  clearWorkflow: () => void;
  duplicateNode: (id: string) => void;
}

export function useAutomation(options: UseAutomationOptions = {}): UseAutomationReturn {
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [connections, setConnections] = useState<AutomationConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [currentExecution, setCurrentExecution] = useState<ExecutionRecord | null>(null);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const addNode = useCallback((type: string, name: string, icon: string, x: number, y: number, config: Record<string, any> = {}) => {
    const newNode: AutomationNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: type as AutomationNode['type'],
      name,
      icon,
      x,
      y,
      config,
      status: 'idle',
    };
    setNodes(prev => [...prev, newNode]);
  }, []);

  const removeNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  }, []);

  const updateNodeConfig = useCallback((id: string, config: Record<string, any>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, config: { ...n.config, ...config } } : n));
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const addConnection = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const exists = connections.some(c => c.sourceId === sourceId && c.targetId === targetId);
    if (exists) return;
    const newConn: AutomationConnection = {
      id: `conn-${Date.now()}`,
      sourceId,
      targetId,
    };
    setConnections(prev => [...prev, newConn]);
  }, [connections]);

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  const getExecutionOrder = useCallback((): AutomationNode[] => {
    const order: AutomationNode[] = [];
    const visited = new Set<string>();
    const triggers = nodes.filter(n => n.type === 'trigger');

    function traverse(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      if (node) order.push(node);
      const outgoing = connections.filter(c => c.sourceId === nodeId);
      outgoing.forEach(conn => traverse(conn.targetId));
    }

    triggers.forEach(t => traverse(t.id));
    nodes.forEach(n => { if (!visited.has(n.id)) order.push(n); });
    return order;
  }, [nodes, connections]);

  const executeWorkflow = useCallback(async () => {
    if (isRunning || nodes.length === 0) return;
    setIsRunning(true);

    const execution: ExecutionRecord = {
      id: `exec-${Date.now()}`,
      workflowId: options.workflowId || 'default',
      startedAt: new Date().toISOString(),
      completedAt: '',
      status: 'running',
      nodesExecuted: 0,
      totalNodes: nodes.length,
      duration: 0,
      nodeResults: [],
    };
    setCurrentExecution(execution);

    const order = getExecutionOrder();
    let hasError = false;

    for (const node of order) {
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, status: 'running' } : n));
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));

      const success = Math.random() > 0.1;
      const status = success ? 'success' : 'error';
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, status } : n));

      execution.nodesExecuted++;
      execution.nodeResults.push({ nodeId: node.id, status, output: success ? 'OK' : 'Failed' });

      if (!success) {
        hasError = true;
        break;
      }
    }

    execution.completedAt = new Date().toISOString();
    execution.status = hasError ? 'error' : 'success';
    execution.duration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime();

    setCurrentExecution(execution);
    setExecutionHistory(prev => [execution, ...prev]);
    setIsRunning(false);

    setTimeout(() => {
      setNodes(prev => prev.map(n => ({ ...n, status: 'idle' })));
      setCurrentExecution(null);
    }, 3000);
  }, [isRunning, nodes, options.workflowId, getExecutionOrder]);

  const stopExecution = useCallback(() => {
    setIsRunning(false);
    setNodes(prev => prev.map(n => ({ ...n, status: n.status === 'running' ? 'idle' : n.status })));
    setCurrentExecution(null);
  }, []);

  const saveWorkflow = useCallback(() => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 500);
  }, []);

  const clearWorkflow = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setSelectedNodeId(null);
  }, []);

  const duplicateNode = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    addNode(node.type, node.name, node.icon, node.x + 50, node.y + 50, { ...node.config });
  }, [nodes, addNode]);

  return {
    nodes,
    connections,
    selectedNode,
    isRunning,
    isSaving,
    executionHistory,
    currentExecution,
    addNode,
    removeNode,
    moveNode,
    updateNodeConfig,
    selectNode,
    addConnection,
    removeConnection,
    executeWorkflow,
    stopExecution,
    saveWorkflow,
    clearWorkflow,
    duplicateNode,
  };
}

export default useAutomation;
