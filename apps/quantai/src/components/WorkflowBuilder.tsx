// ============================================================================
// QuantAI - WorkflowBuilder Component
// Visual automation builder with node graph, conditions, loops
// ============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'loop';
  label: string;
  icon: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

interface WorkflowBuilderProps {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  onAddNode: (node: WorkflowNode) => void;
  onRemoveNode: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onDisconnect: (connectionId: string) => void;
  onSelectNode: (id: string | null) => void;
  selectedNodeId: string | null;
  isReadOnly?: boolean;
}

export default function WorkflowBuilder({
  nodes,
  connections,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  onConnect,
  onDisconnect,
  onSelectNode,
  selectedNodeId,
  isReadOnly = false,
}: WorkflowBuilderProps): JSX.Element {
  const [dragState, setDragState] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const getConnectionPath = useMemo(() => {
    return (conn: WorkflowConnection) => {
      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return '';
      const x1 = fromNode.x + 80;
      const y1 = fromNode.y + 40;
      const x2 = toNode.x;
      const y2 = toNode.y + 40;
      const cx = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    };
  }, [nodes]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (isReadOnly) return;
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setDragState({
        nodeId,
        offsetX: e.clientX - node.x,
        offsetY: e.clientY - node.y,
      });
      onSelectNode(nodeId);
    },
    [nodes, isReadOnly, onSelectNode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;
      const x = e.clientX - dragState.offsetX;
      const y = e.clientY - dragState.offsetY;
      onMoveNode(dragState.nodeId, Math.max(0, x), Math.max(0, y));
    },
    [dragState, onMoveNode],
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handlePortClick = useCallback(
    (nodeId: string, isOutput: boolean) => {
      if (isReadOnly) return;
      if (isOutput) {
        setConnectingFrom(nodeId);
      } else if (connectingFrom && connectingFrom !== nodeId) {
        onConnect(connectingFrom, nodeId);
        setConnectingFrom(null);
      }
    },
    [connectingFrom, isReadOnly, onConnect],
  );

  const handleCanvasClick = useCallback(() => {
    setConnectingFrom(null);
    onSelectNode(null);
  }, [onSelectNode]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.1, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  }, []);

  const getNodeColor = useCallback((type: string) => {
    switch (type) {
      case 'trigger':
        return '#10b981';
      case 'action':
        return '#3b82f6';
      case 'condition':
        return '#f59e0b';
      case 'loop':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  }, []);

  return (
    <div className="workflow-builder-component">
      <div className="builder-toolbar">
        <button className="btn-zoom-in" onClick={handleZoomIn}>
          +
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="btn-zoom-out" onClick={handleZoomOut}>
          -
        </button>
        {connectingFrom && (
          <span className="connecting-indicator">
            Connecting from node... (click target input port)
          </span>
        )}
      </div>

      <div
        className="builder-canvas"
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        style={{ transform: `scale(${zoom})` }}
      >
        <svg className="connections-svg" width="100%" height="100%">
          {connections.map((conn) => (
            <g key={conn.id}>
              <path
                d={getConnectionPath(conn)}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2}
                className="connection-path"
              />
              {conn.label && (
                <text
                  x={
                    ((nodes.find((n) => n.id === conn.from)?.x ?? 0) +
                      (nodes.find((n) => n.id === conn.to)?.x ?? 0)) /
                      2 +
                    80
                  }
                  y={
                    ((nodes.find((n) => n.id === conn.from)?.y ?? 0) +
                      (nodes.find((n) => n.id === conn.to)?.y ?? 0)) /
                    2
                  }
                  className="connection-label"
                  textAnchor="middle"
                >
                  {conn.label}
                </text>
              )}
              {!isReadOnly && (
                <circle
                  cx={
                    ((nodes.find((n) => n.id === conn.from)?.x ?? 0) +
                      (nodes.find((n) => n.id === conn.to)?.x ?? 0)) /
                      2 +
                    80
                  }
                  cy={
                    ((nodes.find((n) => n.id === conn.from)?.y ?? 0) +
                      (nodes.find((n) => n.id === conn.to)?.y ?? 0)) /
                      2 +
                    15
                  }
                  r={8}
                  fill="#ef4444"
                  className="delete-connection"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisconnect(conn.id);
                  }}
                />
              )}
            </g>
          ))}
        </svg>

        {nodes.map((node) => (
          <div
            key={node.id}
            className={`builder-node ${node.type} ${selectedNodeId === node.id ? 'selected' : ''}`}
            style={{
              left: node.x,
              top: node.y,
              borderColor: getNodeColor(node.type),
            }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
          >
            <div className="node-port input" onClick={() => handlePortClick(node.id, false)} />
            <div className="node-content">
              <span className="node-icon">{node.icon}</span>
              <span className="node-label">{node.label}</span>
              <span className="node-type-badge" style={{ color: getNodeColor(node.type) }}>
                {node.type}
              </span>
            </div>
            <div className="node-port output" onClick={() => handlePortClick(node.id, true)} />
            {!isReadOnly && (
              <button
                className="btn-remove-node"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveNode(node.id);
                }}
              >
                x
              </button>
            )}
          </div>
        ))}

        {nodes.length === 0 && (
          <div className="empty-canvas-msg">
            <p>No nodes yet. Add nodes to build your workflow.</p>
          </div>
        )}
      </div>
    </div>
  );
}
