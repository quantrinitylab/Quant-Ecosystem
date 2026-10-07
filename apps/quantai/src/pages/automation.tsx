// ============================================================================
// QuantAI - Visual Workflow Automation Builder
// Drag-and-drop node palette, canvas with connected nodes, node editor panel,
// test run execution, execution history, enable/disable per workflow
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  name: string;
  description: string;
  icon: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
  status: 'idle' | 'running' | 'success' | 'error';
}

interface NodeConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

interface ExecutionLog {
  id: string;
  workflowName: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'error' | 'partial';
  nodesExecuted: number;
  duration: number;
  error?: string;
}

interface NodeTemplate {
  type: 'trigger' | 'action' | 'condition' | 'delay';
  name: string;
  icon: string;
  description: string;
  defaultConfig: Record<string, string | number | boolean>;
}

const NODE_PALETTE: NodeTemplate[] = [
  { type: 'trigger', name: 'Schedule', icon: '⏰', description: 'Run on a schedule', defaultConfig: { cron: '0 9 * * *', timezone: 'UTC' } },
  { type: 'trigger', name: 'Webhook', icon: '🔗', description: 'HTTP webhook trigger', defaultConfig: { method: 'POST', path: '/webhook' } },
  { type: 'trigger', name: 'Email Received', icon: '📧', description: 'When email arrives', defaultConfig: { filter: 'all', folder: 'inbox' } },
  { type: 'trigger', name: 'Device Event', icon: '📱', description: 'Device state change', defaultConfig: { device: '', event: 'stateChange' } },
  { type: 'action', name: 'Send Email', icon: '✉️', description: 'Send an email', defaultConfig: { to: '', subject: '', body: '' } },
  { type: 'action', name: 'HTTP Request', icon: '🌐', description: 'Make API call', defaultConfig: { url: '', method: 'GET', headers: '{}' } },
  { type: 'action', name: 'AI Generate', icon: '🤖', description: 'Generate with AI', defaultConfig: { prompt: '', model: 'gpt-4', maxTokens: 500 } },
  { type: 'action', name: 'Send Notification', icon: '🔔', description: 'Push notification', defaultConfig: { title: '', message: '', channel: 'default' } },
  { type: 'action', name: 'Update Database', icon: '💾', description: 'Write to database', defaultConfig: { collection: '', operation: 'insert', data: '{}' } },
  { type: 'action', name: 'Control Device', icon: '🏠', description: 'Control smart device', defaultConfig: { deviceId: '', command: 'toggle', value: '' } },
  { type: 'condition', name: 'If/Else', icon: '🔀', description: 'Conditional branch', defaultConfig: { field: '', operator: 'equals', value: '' } },
  { type: 'condition', name: 'Filter', icon: '🔍', description: 'Filter data', defaultConfig: { expression: '', passThrough: true } },
  { type: 'delay', name: 'Wait', icon: '⏳', description: 'Delay execution', defaultConfig: { duration: 5, unit: 'seconds' } },
  { type: 'delay', name: 'Wait Until', icon: '📅', description: 'Wait for condition', defaultConfig: { condition: '', timeout: 3600 } },
];

export default function AutomationPage(): JSX.Element {
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: 'n1', type: 'trigger', name: 'Schedule', description: 'Run daily at 9am', icon: '⏰', x: 100, y: 150, config: { cron: '0 9 * * *', timezone: 'UTC' }, status: 'idle' },
    { id: 'n2', type: 'action', name: 'AI Generate', description: 'Generate daily summary', icon: '🤖', x: 350, y: 150, config: { prompt: 'Summarize today...', model: 'gpt-4', maxTokens: 500 }, status: 'idle' },
    { id: 'n3', type: 'action', name: 'Send Email', description: 'Send summary email', icon: '✉️', x: 600, y: 150, config: { to: 'user@example.com', subject: 'Daily Summary', body: '' }, status: 'idle' },
  ]);
  const [connections, setConnections] = useState<NodeConnection[]>([
    { id: 'conn1', sourceId: 'n1', targetId: 'n2' },
    { id: 'conn2', sourceId: 'n2', targetId: 'n3' },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<ExecutionLog[]>([
    { id: 'e1', workflowName: 'Daily Summary', startedAt: '2024-01-15T09:00:00Z', completedAt: '2024-01-15T09:00:12Z', status: 'success', nodesExecuted: 3, duration: 12000 },
    { id: 'e2', workflowName: 'Daily Summary', startedAt: '2024-01-14T09:00:00Z', completedAt: '2024-01-14T09:00:08Z', status: 'success', nodesExecuted: 3, duration: 8000 },
    { id: 'e3', workflowName: 'Daily Summary', startedAt: '2024-01-13T09:00:00Z', completedAt: '2024-01-13T09:00:15Z', status: 'error', nodesExecuted: 2, duration: 15000, error: 'Email service timeout' },
  ]);
  const [workflowName, setWorkflowName] = useState<string>('Daily Summary Workflow');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTemplate, setDragTemplate] = useState<NodeTemplate | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find(n => n.id === selectedNode) || null;
  }, [selectedNode, nodes]);

  const handleDragStart = useCallback((template: NodeTemplate) => {
    setIsDragging(true);
    setDragTemplate(template);
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragTemplate || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newNode: WorkflowNode = {
      id: `n${Date.now()}`,
      type: dragTemplate.type,
      name: dragTemplate.name,
      description: dragTemplate.description,
      icon: dragTemplate.icon,
      x,
      y,
      config: { ...dragTemplate.defaultConfig },
      status: 'idle',
    };
    setNodes(prev => [...prev, newNode]);
    setIsDragging(false);
    setDragTemplate(null);
  }, [dragTemplate]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId === selectedNode ? null : nodeId);
  }, [selectedNode]);

  const handleNodeConfigChange = useCallback((key: string, value: string | number | boolean) => {
    if (!selectedNode) return;
    setNodes(prev => prev.map(n =>
      n.id === selectedNode ? { ...n, config: { ...n.config, [key]: value } } : n
    ));
  }, [selectedNode]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  }, [selectedNode]);

  const handleConnect = useCallback((sourceId: string, targetId: string) => {
    const exists = connections.some(c => c.sourceId === sourceId && c.targetId === targetId);
    if (!exists && sourceId !== targetId) {
      setConnections(prev => [...prev, { id: `conn${Date.now()}`, sourceId, targetId }]);
    }
  }, [connections]);

  const handleTestRun = useCallback(async () => {
    if (isRunning || nodes.length === 0) return;
    setIsRunning(true);
    setError(null);

    for (let i = 0; i < nodes.length; i++) {
      setNodes(prev => prev.map((n, idx) =>
        idx === i ? { ...n, status: 'running' } : n
      ));
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      setNodes(prev => prev.map((n, idx) =>
        idx === i ? { ...n, status: 'success' } : n
      ));
    }

    const newLog: ExecutionLog = {
      id: `e${Date.now()}`,
      workflowName,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'success',
      nodesExecuted: nodes.length,
      duration: nodes.length * 1500,
    };
    setExecutionLog(prev => [newLog, ...prev]);
    setIsRunning(false);

    setTimeout(() => {
      setNodes(prev => prev.map(n => ({ ...n, status: 'idle' })));
    }, 2000);
  }, [isRunning, nodes, workflowName]);

  const handleSave = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  }, []);

  const getConnectionPath = useCallback((conn: NodeConnection) => {
    const source = nodes.find(n => n.id === conn.sourceId);
    const target = nodes.find(n => n.id === conn.targetId);
    if (!source || !target) return '';
    const sx = source.x + 120;
    const sy = source.y + 30;
    const tx = target.x;
    const ty = target.y + 30;
    const mx = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
  }, [nodes]);

  if (error) {
    return (
      <div className="automation-page error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="automation-page">
      <header className="automation-header">
        <div className="workflow-info">
          <input
            type="text"
            value={workflowName}
            onChange={e => setWorkflowName(e.target.value)}
            className="workflow-name-input"
          />
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={e => setIsEnabled(e.target.checked)}
            />
            <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <div className="header-actions">
          <button
            className={`btn-test-run ${isRunning ? 'running' : ''}`}
            onClick={handleTestRun}
            disabled={isRunning || nodes.length === 0}
          >
            {isRunning ? '⏳ Running...' : '▶ Test Run'}
          </button>
          <button className="btn-history" onClick={() => setShowHistory(!showHistory)}>
            📋 History ({executionLog.length})
          </button>
          <button className="btn-save" onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : '💾 Save'}
          </button>
        </div>
      </header>

      <div className="automation-body">
        <aside className="node-palette">
          <h3>Triggers</h3>
          <div className="palette-group">
            {NODE_PALETTE.filter(n => n.type === 'trigger').map((template, i) => (
              <div
                key={i}
                className="palette-item trigger"
                draggable
                onDragStart={() => handleDragStart(template)}
              >
                <span className="palette-icon">{template.icon}</span>
                <div className="palette-info">
                  <div className="palette-name">{template.name}</div>
                  <div className="palette-desc">{template.description}</div>
                </div>
              </div>
            ))}
          </div>
          <h3>Actions</h3>
          <div className="palette-group">
            {NODE_PALETTE.filter(n => n.type === 'action').map((template, i) => (
              <div
                key={i}
                className="palette-item action"
                draggable
                onDragStart={() => handleDragStart(template)}
              >
                <span className="palette-icon">{template.icon}</span>
                <div className="palette-info">
                  <div className="palette-name">{template.name}</div>
                  <div className="palette-desc">{template.description}</div>
                </div>
              </div>
            ))}
          </div>
          <h3>Logic</h3>
          <div className="palette-group">
            {NODE_PALETTE.filter(n => n.type === 'condition' || n.type === 'delay').map((template, i) => (
              <div
                key={i}
                className="palette-item logic"
                draggable
                onDragStart={() => handleDragStart(template)}
              >
                <span className="palette-icon">{template.icon}</span>
                <div className="palette-info">
                  <div className="palette-name">{template.name}</div>
                  <div className="palette-desc">{template.description}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div
          className="workflow-canvas"
          ref={canvasRef}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
        >
          <svg className="connections-layer">
            {connections.map(conn => (
              <path
                key={conn.id}
                d={getConnectionPath(conn)}
                className="connection-line"
                fill="none"
                stroke="#6366f1"
                strokeWidth={2}
              />
            ))}
          </svg>
          {nodes.map(node => (
            <div
              key={node.id}
              className={`workflow-node ${node.type} ${node.status} ${selectedNode === node.id ? 'selected' : ''}`}
              style={{ left: node.x, top: node.y }}
              onClick={() => handleNodeClick(node.id)}
            >
              <div className="node-header">
                <span className="node-icon">{node.icon}</span>
                <span className="node-name">{node.name}</span>
                {node.status === 'running' && <span className="node-spinner">⟳</span>}
                {node.status === 'success' && <span className="node-check">✓</span>}
                {node.status === 'error' && <span className="node-error">✗</span>}
              </div>
              <div className="node-description">{node.description}</div>
              <div className="node-ports">
                <div className="port port-in" onClick={e => { e.stopPropagation(); }} />
                <div className="port port-out" onClick={e => { e.stopPropagation(); }} />
              </div>
            </div>
          ))}
          {nodes.length === 0 && (
            <div className="canvas-empty">
              <p>Drag nodes from the palette to build your workflow</p>
            </div>
          )}
        </div>

        {selectedNodeData && (
          <aside className="node-editor">
            <div className="editor-header">
              <h3>{selectedNodeData.icon} {selectedNodeData.name}</h3>
              <button className="btn-close" onClick={() => setSelectedNode(null)}>x</button>
            </div>
            <div className="editor-body">
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={selectedNodeData.description}
                  onChange={e => setNodes(prev => prev.map(n =>
                    n.id === selectedNode ? { ...n, description: e.target.value } : n
                  ))}
                />
              </div>
              {Object.entries(selectedNodeData.config).map(([key, value]) => (
                <div key={key} className="form-group">
                  <label>{key}</label>
                  {typeof value === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={e => handleNodeConfigChange(key, e.target.checked)}
                    />
                  ) : typeof value === 'number' ? (
                    <input
                      type="number"
                      value={value}
                      onChange={e => handleNodeConfigChange(key, Number(e.target.value))}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(value)}
                      onChange={e => handleNodeConfigChange(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <button className="btn-delete-node" onClick={() => handleDeleteNode(selectedNodeData.id)}>
                Delete Node
              </button>
            </div>
          </aside>
        )}

        {showHistory && (
          <aside className="execution-history">
            <div className="history-header">
              <h3>Execution History</h3>
              <button onClick={() => setShowHistory(false)}>x</button>
            </div>
            <div className="history-list">
              {executionLog.length === 0 ? (
                <p className="empty-history">No executions yet</p>
              ) : (
                executionLog.map(log => (
                  <div key={log.id} className={`history-item ${log.status}`}>
                    <div className="history-status">
                      {log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : '◐'}
                    </div>
                    <div className="history-info">
                      <div className="history-time">
                        {new Date(log.startedAt).toLocaleString()}
                      </div>
                      <div className="history-meta">
                        {log.nodesExecuted} nodes | {(log.duration / 1000).toFixed(1)}s
                      </div>
                      {log.error && <div className="history-error">{log.error}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
