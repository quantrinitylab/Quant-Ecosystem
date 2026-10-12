// ============================================================================
// QuantAI - Visual Workflow Automation Builder
// Drag-and-drop node palette, canvas with connected nodes, node editor panel,
// real execution via /api/automations/*, and execution history loaded from
// the backend's durable run records. Nothing on this page is fabricated:
// history only ever shows runs the backend actually persisted.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '../services/api-client';
import type { Automation } from '../types';
import {
  workflowNodesToPayload,
  automationToCanvas,
  runToExecutionLog,
  demoTemplateNodes,
  demoTemplateConnections,
  type CanvasNode,
  type CanvasConnection,
  type ExecutionLog,
} from '../lib/automation-mapper';

interface WorkflowNode extends CanvasNode {
  status: 'idle' | 'running' | 'success' | 'error';
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

function apiErrorMessage(res: { error?: { message?: string } } | null, fallback: string): string {
  const msg = res?.error?.message;
  return msg ? `${fallback}: ${msg}` : fallback;
}

export default function AutomationPage(): JSX.Element {
  // ---- canvas draft (local until saved) ----
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState<string>('Untitled Workflow');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTemplate, setDragTemplate] = useState<NodeTemplate | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);

  // ---- persisted automations ----
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState<boolean>(true);
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedActionNodeIds, setSavedActionNodeIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // ---- run + history (real backend data only) ----
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<ExecutionLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const [pageError, setPageError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const loadAutomations = useCallback(async () => {
    setLoadingAutomations(true);
    setAutomationsError(null);
    try {
      const res = await apiClient.listAutomations();
      if (res.success && Array.isArray(res.data)) {
        setAutomations(res.data);
      } else {
        setAutomationsError(apiErrorMessage(res, "Couldn't load your automations"));
      }
    } catch {
      setAutomationsError("Couldn't reach the automation service. Check your connection and try again.");
    } finally {
      setLoadingAutomations(false);
    }
  }, []);

  const loadHistory = useCallback(async (id: string, name: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await apiClient.listAutomationRuns(id);
      if (res.success && Array.isArray(res.data)) {
        setExecutionLog(res.data.map((run) => runToExecutionLog(run, name)));
      } else {
        setHistoryError(apiErrorMessage(res, "Couldn't load execution history"));
        setExecutionLog([]);
      }
    } catch {
      setHistoryError("Couldn't reach the automation service.");
      setExecutionLog([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  const resetDraft = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setSelectedNode(null);
    setWorkflowName('Untitled Workflow');
    setIsEnabled(true);
    setSavedId(null);
    setSavedActionNodeIds([]);
    setExecutionLog([]);
    setHistoryError(null);
    setDirty(false);
  }, []);

  const selectAutomation = useCallback(async (id: string) => {
    setPageError(null);
    try {
      const res = await apiClient.getAutomation(id);
      if (!res.success || !res.data) {
        setPageError(apiErrorMessage(res, "Couldn't open that automation"));
        return;
      }
      const automation = res.data;
      const { nodes: canvasNodes, connections: canvasConns } = automationToCanvas(automation);
      setNodes(canvasNodes.map((n) => ({ ...n, status: 'idle' as const })));
      setConnections(canvasConns);
      setSelectedNode(null);
      setWorkflowName(automation.name);
      setIsEnabled(automation.isActive);
      setSavedId(automation.id);
      setSavedActionNodeIds(automation.actions.map((_, i) => `a${i + 1}`));
      setDirty(false);
      loadHistory(automation.id, automation.name);
    } catch {
      setPageError("Couldn't reach the automation service. Check your connection and try again.");
    }
  }, [loadHistory]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find(n => n.id === selectedNode) || null;
  }, [selectedNode, nodes]);

  const markDirty = useCallback(() => {
    if (savedId) setDirty(true);
  }, [savedId]);

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
    markDirty();
  }, [dragTemplate, markDirty]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleLoadDemo = useCallback(() => {
    setNodes(demoTemplateNodes().map((n) => ({ ...n, status: 'idle' as const })));
    setConnections(demoTemplateConnections());
    setWorkflowName('Daily Summary Workflow');
    markDirty();
  }, [markDirty]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId === selectedNode ? null : nodeId);
  }, [selectedNode]);

  const handleNodeConfigChange = useCallback((key: string, value: string | number | boolean) => {
    if (!selectedNode) return;
    setNodes(prev => prev.map(n =>
      n.id === selectedNode ? { ...n, config: { ...n.config, [key]: value } } : n
    ));
    markDirty();
  }, [selectedNode, markDirty]);

  const handleNodeDescriptionChange = useCallback((value: string) => {
    if (!selectedNode) return;
    setNodes(prev => prev.map(n =>
      n.id === selectedNode ? { ...n, description: value } : n
    ));
    markDirty();
  }, [selectedNode, markDirty]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
    markDirty();
  }, [selectedNode, markDirty]);

  const handleConnect = useCallback((sourceId: string, targetId: string) => {
    const exists = connections.some(c => c.sourceId === sourceId && c.targetId === targetId);
    if (!exists && sourceId !== targetId) {
      setConnections(prev => [...prev, { id: `conn${Date.now()}`, sourceId, targetId }]);
      markDirty();
    }
  }, [connections, markDirty]);

  const handleNameChange = useCallback((value: string) => {
    setWorkflowName(value);
    markDirty();
  }, [markDirty]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setPageError(null);
    try {
      const payload = workflowNodesToPayload(nodes, workflowName, isEnabled);
      const res = savedId
        ? await apiClient.updateAutomation(savedId, payload)
        : await apiClient.createAutomation(payload);
      if (!res.success || !res.data) {
        setPageError(apiErrorMessage(res, 'Save failed'));
        return;
      }
      const saved = res.data;
      setSavedId(saved.id);
      setSavedActionNodeIds(saved.actions.map((_, i) => `a${i + 1}`));
      setDirty(false);
      // Refresh the saved list without a full reload.
      setAutomations((prev) => {
        const rest = prev.filter((a) => a.id !== saved.id);
        return [saved, ...rest];
      });
    } catch {
      setPageError("Couldn't reach the automation service. Your changes are still on the canvas.");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, nodes, workflowName, isEnabled, savedId]);

  const handleRun = useCallback(async () => {
    if (isRunning || nodes.length === 0) return;
    if (!savedId) {
      setPageError('Save this workflow first — only saved automations can run.');
      return;
    }
    if (dirty) {
      setPageError('You have unsaved changes — save before running so the run matches the canvas.');
      return;
    }
    setIsRunning(true);
    setPageError(null);
    setNodes(prev => prev.map(n =>
      n.type === 'trigger' ? n : { ...n, status: 'running' as const }
    ));
    try {
      const res = await apiClient.executeAutomation(savedId);
      if (!res.success || !res.data) {
        setPageError(apiErrorMessage(res, 'Run failed'));
        setNodes(prev => prev.map(n => ({ ...n, status: 'idle' as const })));
        return;
      }
      const run = res.data;
      // History entry comes from the REAL persisted run record, never invented.
      const entry = runToExecutionLog(run, workflowName);
      setExecutionLog(prev => [entry, ...prev.filter((e) => e.id !== entry.id)]);
      setNodes(prev => prev.map(n => {
        const stepIndex = savedActionNodeIds.indexOf(n.id);
        if (stepIndex < 0) return { ...n, status: 'idle' as const };
        const checkpoint = run.checkpoints[stepIndex];
        return {
          ...n,
          status: !checkpoint ? 'idle' : checkpoint.status === 'completed' ? 'success' : 'error',
        } as WorkflowNode;
      }));
      if (run.status === 'failed') {
        setPageError(`Run finished with errors${run.error ? `: ${run.error}` : ''}. See History for step details.`);
      }
    } catch {
      setPageError("Couldn't reach the automation service. The run may not have started.");
      setNodes(prev => prev.map(n => ({ ...n, status: 'idle' as const })));
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        setNodes(prev => prev.map(n => ({ ...n, status: 'idle' as const })));
      }, 4000);
    }
  }, [isRunning, nodes.length, savedId, dirty, workflowName, savedActionNodeIds]);

  const handleToggleEnabled = useCallback(async () => {
    if (!savedId) {
      setIsEnabled((v) => !v);
      return;
    }
    setPageError(null);
    try {
      const res = await apiClient.toggleAutomation(savedId);
      if (!res.success || !res.data) {
        setPageError(apiErrorMessage(res, "Couldn't change the enabled state"));
        return;
      }
      const active = !!res.data.isActive;
      setIsEnabled(active);
      setDirty(false);
      setAutomations((prev) => prev.map((a) => (a.id === savedId ? { ...a, isActive: active } : a)));
    } catch {
      setPageError("Couldn't reach the automation service.");
    }
  }, [savedId]);

  const handleDelete = useCallback(async () => {
    if (!savedId) {
      resetDraft();
      return;
    }
    if (!window.confirm(`Delete "${workflowName}"? This cannot be undone.`)) return;
    setPageError(null);
    try {
      const res = await apiClient.deleteAutomation(savedId);
      if (!res.success) {
        setPageError(apiErrorMessage(res, "Couldn't delete the automation"));
        return;
      }
      setAutomations((prev) => prev.filter((a) => a.id !== savedId));
      resetDraft();
    } catch {
      setPageError("Couldn't reach the automation service.");
    }
  }, [savedId, workflowName, resetDraft]);

  const getConnectionPath = useCallback((conn: CanvasConnection) => {
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

  return (
    <div className="automation-page">
      <div className="automation-list-bar">
        {loadingAutomations ? (
          <span className="list-loading">Loading your automations…</span>
        ) : automationsError ? (
          <span className="list-error">
            {automationsError}{' '}
            <button className="btn-retry" onClick={loadAutomations}>Retry</button>
          </span>
        ) : (
          <>
            <select
              className="automation-select"
              value={savedId ?? ''}
              onChange={e => (e.target.value ? selectAutomation(e.target.value) : resetDraft())}
              aria-label="Saved automations"
            >
              <option value="">+ New workflow (unsaved draft)</option>
              {automations.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.isActive ? '' : ' (disabled)'}
                </option>
              ))}
            </select>
            <span className="list-meta">
              {automations.length === 0
                ? 'No saved automations yet'
                : `${automations.length} saved automation${automations.length === 1 ? '' : 's'}`}
              {dirty && savedId ? ' · unsaved changes' : ''}
            </span>
          </>
        )}
      </div>

      {pageError && (
        <div className="error-banner" role="alert">
          <span>{pageError}</span>
          <button onClick={() => setPageError(null)}>Dismiss</button>
        </div>
      )}

      <header className="automation-header">
        <div className="workflow-info">
          <input
            type="text"
            value={workflowName}
            onChange={e => handleNameChange(e.target.value)}
            className="workflow-name-input"
            aria-label="Workflow name"
          />
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={handleToggleEnabled}
            />
            <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <div className="header-actions">
          <button
            className={`btn-test-run ${isRunning ? 'running' : ''}`}
            onClick={handleRun}
            disabled={isRunning || nodes.length === 0}
            title={savedId ? 'Run this automation now' : 'Save the workflow first, then run it'}
          >
            {isRunning ? '⏳ Running…' : '▶ Run'}
          </button>
          <button className="btn-history" onClick={() => setShowHistory(!showHistory)}>
            📋 History ({executionLog.length})
          </button>
          <button className="btn-save" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : '💾 Save'}
          </button>
          {savedId && (
            <button className="btn-delete" onClick={handleDelete}>
              🗑 Delete
            </button>
          )}
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
                <div className="port port-out" onClick={e => { e.stopPropagation(); handleConnect(selectedNode || '', node.id); }} />
              </div>
            </div>
          ))}
          {nodes.length === 0 && (
            <div className="canvas-empty">
              <p>Drag nodes from the palette to build your workflow</p>
              <p className="demo-hint">Want a starting point? This template is local-only until you save it.</p>
              <button className="btn-demo" onClick={handleLoadDemo}>Load demo template</button>
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
                  onChange={e => handleNodeDescriptionChange(e.target.value)}
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
              {historyLoading ? (
                <p className="empty-history">Loading history…</p>
              ) : historyError ? (
                <p className="empty-history">{historyError}</p>
              ) : executionLog.length === 0 ? (
                <p className="empty-history">
                  No executions yet. Runs you trigger from this page are recorded here.
                </p>
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
                        {log.nodesExecuted} steps | {(log.duration / 1000).toFixed(1)}s
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
