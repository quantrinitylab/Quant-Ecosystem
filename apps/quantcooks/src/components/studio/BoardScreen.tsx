// ============================================================================
// QuantCooks Studio — Canvas Board screen (spec §6.2–§6.3, #48/#49)
//
// A node-graph workspace. The document (board.ts) is the truth; this
// screen is its projection: positioned node cards, SVG wires, an
// expanded settings panel that is the SAME node state at a bigger size,
// a run plan that prices every step before anything could execute, and
// the three slide-over panels from BoardPanels.tsx.
//
// What is REAL today: every graph operation (add / move / wire with
// reasoned refusals / delete / undo / redo / arrange / zoom / minimap),
// asset binding from the caller's READY assets, per-node quotes composed
// on pricing.ts, the run PLAN (topological, priced, nothing charged),
// and saving the chain as a reusable pipeline definition.
// What is NOT real, and says so wherever it appears: execution —
// quantcooks.run_pipeline's providers are not configured, so Generate
// on a node and Run on the board produce plans and NOT_CONFIGURED
// states, never outputs. Results will appear as new nodes when a
// provider lands; today no result node is ever invented.
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  BOARD_NODE_TYPES,
  BOARD_RUN_TOOL,
  NODE_HEIGHT,
  NODE_WIDTH,
  addNode,
  arrangeBoard,
  bindAssetToNode,
  canConnect,
  connectNodes,
  disconnectEdge,
  edgeBindingLabel,
  effectivePrompt,
  generationKindFor,
  historyOf,
  historyPush,
  historyRedo,
  historyUndo,
  inputLabels,
  isGeneratorType,
  moveNodeBy,
  nodeById,
  nodeMeta,
  nodeQuote,
  pickableBoardAssets,
  planBoardRun,
  removeNode,
  renameBoard,
  twinToolFor,
  updateNode,
  type BoardDoc,
  type BoardHistory,
  type BoardNode,
  type BoardNodeType,
  type BoardRunPlan,
} from '../../lib/studio/board';
import { STUDIO_MODEL_RATES, type ComposerSettings } from '../../lib/studio/pricing';
import { JobStrip } from './JobStrip';
import { BoardAssistant, BoardShare, BoardTeamChat } from './BoardPanels';

export type BoardAssetsState = 'loading' | 'ready' | 'error';
export type BoardPanel = 'assistant' | 'chat' | 'share' | null;
export type BoardToolMode = 'select' | 'pan' | 'connect';

export interface BoardScreenProps {
  initialDoc: BoardDoc;
  assets?: ServerAsset[];
  assetsState: BoardAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** Persist the document to the mirror (page wires board.ts storage). */
  onSave?: (doc: BoardDoc) => void;
  /** Save the chain as a reusable pipeline (run_pipeline's shape). */
  onSavePipeline?: (doc: BoardDoc) => void;
  jobs?: StudioJob[];
  initialSelectedId?: string | null;
  initialPanel?: BoardPanel;
  initialRunRequested?: boolean;
  initialHintHidden?: boolean;
}

const RATIOS = ['16:9', '1:1', '9:16', '4:5'];
const RESOLUTIONS: Record<string, string[]> = {
  image: ['Draft', 'Standard', 'High'],
  video: ['720p', '1080p'],
  audio: ['Standard'],
  ad: ['720p', '1080p'],
};

export const BoardScreen: React.FC<BoardScreenProps> = ({
  initialDoc,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  onSave,
  onSavePipeline,
  jobs = [],
  initialSelectedId = null,
  initialPanel = null,
  initialRunRequested = false,
  initialHintHidden = false,
}) => {
  const [history, setHistory] = useState<BoardHistory>(() => historyOf(initialDoc));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [toolMode, setToolMode] = useState<BoardToolMode>('select');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [panel, setPanel] = useState<BoardPanel>(initialPanel);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hintHidden, setHintHidden] = useState(initialHintHidden);
  const [runPlan, setRunPlan] = useState<BoardRunPlan | null>(() =>
    initialRunRequested ? planBoardRun(initialDoc, false) : null,
  );
  const [pipelineSaved, setPipelineSaved] = useState(false);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const doc = history.present;
  const selected = selectedId ? nodeById(doc, selectedId) : null;
  const pickable = useMemo(() => pickableBoardAssets(assets), [assets]);
  const stepByNode = useMemo(() => {
    const map = new Map<string, string>();
    for (const step of runPlan?.steps ?? []) map.set(step.nodeId, step.outcome);
    return map;
  }, [runPlan]);

  const commit = (next: BoardDoc) => {
    setHistory((h) => historyPush(h, next));
    onSave?.(next);
  };

  const handleAddNode = (type: BoardNodeType) => {
    const next = addNode(doc, type);
    commit(next);
    const added = next.nodes[next.nodes.length - 1];
    if (added) setSelectedId(added.id);
    setAddMenuOpen(false);
  };

  const handleNodeClick = (node: BoardNode) => {
    if (toolMode === 'connect' || connectFrom) {
      if (!connectFrom) {
        setConnectFrom(node.id);
        setRefusal(null);
        return;
      }
      if (connectFrom === node.id) {
        setConnectFrom(null);
        return;
      }
      const outcome = connectNodes(doc, connectFrom, node.id);
      if (outcome.status === 'connected') {
        commit(outcome.doc);
        setRefusal(null);
      } else {
        setRefusal(outcome.reason);
      }
      setConnectFrom(null);
      return;
    }
    setSelectedId(node.id);
  };

  const handleWireFrom = (fromId: string) => {
    if (!selected) return;
    const outcome = connectNodes(doc, fromId, selected.id);
    if (outcome.status === 'connected') {
      commit(outcome.doc);
      setRefusal(null);
    } else {
      setRefusal(outcome.reason);
    }
  };

  const runBoard = () => {
    setRunPlan(planBoardRun(doc, false));
  };

  const boardExtent = doc.nodes.reduce(
    (acc, n) => ({ w: Math.max(acc.w, n.x + NODE_WIDTH + 40), h: Math.max(acc.h, n.y + NODE_HEIGHT + 40) }),
    { w: 960, h: 480 },
  );

  const renderNodeBody = (node: BoardNode) => {
    const stepOutcome = stepByNode.get(node.id);
    return (
      <>
        <header className="studio-board-node-head">
          <strong>{node.title}</strong>
          <span className="studio-board-node-kind">{nodeMeta(node.type).label}</span>
          {stepOutcome && (
            <span className="studio-board-node-step" data-testid={`board-node-step-${node.id}`}>
              {stepOutcome === 'blocked' ? 'Blocked — no prompt' : 'Not configured'}
            </span>
          )}
        </header>
        {(node.type === 'asset' || node.type === 'reference' || node.type === 'upload') && (
          <div className="studio-board-node-media">
            {node.url ? (
              <img src={node.url} alt={node.filename ?? node.title} />
            ) : (
              <span data-testid={`board-node-unbound-${node.id}`}>
                {node.type === 'upload' ? 'Empty slot — bind media when the pipeline runs.' : 'Not bound yet — pick one of your photos.'}
              </span>
            )}
            {node.filename && <span className="studio-board-node-file">{node.filename}</span>}
          </div>
        )}
        {isGeneratorType(node.type) && (
          <div className="studio-board-node-gen">
            <p className="studio-board-node-prompt">
              {effectivePrompt(doc, node) || 'Describe what you want to create…'}
            </p>
            <span className="studio-board-node-quote" data-testid={`board-node-quote-${node.id}`}>
              {(() => {
                const quote = nodeQuote(node);
                return quote ? `Generate · ${quote.credits} credits` : 'Generate · —';
              })()}
            </span>
          </div>
        )}
        {(node.type === 'prompt' || node.type === 'sticky' || node.type === 'text' || node.type === 'comment') && (
          <p className="studio-board-node-text">{node.text || nodeMeta(node.type).description}</p>
        )}
        {node.type === 'folder' && (
          <p className="studio-board-node-folder">
            {node.memberIds.length} node{node.memberIds.length === 1 ? '' : 's'} grouped
          </p>
        )}
        {node.type === 'assistant' && (
          <p className="studio-board-node-text">{node.text || 'A planning step — wire a Prompt in, a generator out.'}</p>
        )}
        {node.type === 'output' && (
          <p className="studio-board-node-output">
            {inputLabels(doc, node).length > 0
              ? `Collects: ${inputLabels(doc, node).join(', ')}`
              : 'Nothing wired in yet.'}
          </p>
        )}
      </>
    );
  };

  return (
    <section className="studio-board" data-testid="board-screen">
      <header className="studio-board-topbar">
        <label>
          <span className="sr-only">Board title</span>
          <input
            type="text"
            data-testid="board-title"
            value={doc.title}
            onChange={(e) => commit(renameBoard(doc, e.target.value))}
          />
        </label>
        <span className="studio-board-device-note" role="note">
          Draft on this device
        </span>
        <div className="studio-board-top-actions">
          <button
            type="button"
            data-testid="board-open-assistant"
            onClick={() => setPanel(panel === 'assistant' ? null : 'assistant')}
          >
            Ask Quanty
          </button>
          <button
            type="button"
            data-testid="board-open-chat"
            onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
          >
            Team Chat
          </button>
          <button
            type="button"
            data-testid="board-open-share"
            onClick={() => setPanel(panel === 'share' ? null : 'share')}
          >
            Share
          </button>
        </div>
      </header>

      <div className="studio-board-layout">
        {/* ------------------------------------------------ left rail */}
        <div className="studio-board-rail" aria-label="Board tools">
          <button type="button" data-testid="board-undo" disabled={history.past.length === 0} onClick={() => { const h = historyUndo(history); setHistory(h); onSave?.(h.present); }}>
            Undo
          </button>
          <button type="button" data-testid="board-redo" disabled={history.future.length === 0} onClick={() => { const h = historyRedo(history); setHistory(h); onSave?.(h.present); }}>
            Redo
          </button>
          <button type="button" data-testid="board-arrange" onClick={() => commit(arrangeBoard(doc))}>
            Arrange
          </button>
          <button type="button" data-testid="board-zoom-out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
            Zoom −
          </button>
          <span data-testid="board-zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" data-testid="board-zoom-in" onClick={() => setZoom((z) => Math.min(1.5, z + 0.25))}>
            Zoom +
          </button>
          <button type="button" data-testid="board-minimap-toggle" onClick={() => setMinimapOpen((open) => !open)}>
            Minimap
          </button>
        </div>

        {/* ------------------------------------------------ the board */}
        <div className="studio-board-main">
          {!hintHidden && (
            <div className="studio-board-hint" data-testid="board-hint">
              <p>Use + Add Node or the toolbar to create a node, wire its output into the next step, then Run Board to price the chain.</p>
              <label>
                <input type="checkbox" onChange={(e) => { if (e.target.checked) setHintHidden(true); }} /> Don&rsquo;t show again
              </label>
              <button type="button" onClick={() => setHintHidden(true)}>
                Dismiss
              </button>
            </div>
          )}

          {doc.nodes.length === 0 ? (
            <div className="studio-board-empty" data-testid="board-empty">
              <h2>An empty board</h2>
              <p>Start with one of the three shapes most pipelines take:</p>
              <div className="studio-board-starters">
                <button type="button" onClick={() => handleAddNode('prompt')}>
                  Prompt Box
                </button>
                <button type="button" onClick={() => handleAddNode('image-generator')}>
                  Image Generator
                </button>
                <button type="button" onClick={() => handleAddNode('video-generator')}>
                  Video Generator
                </button>
              </div>
            </div>
          ) : (
            <div
              className="studio-board-canvas"
              data-testid="board-canvas"
              style={{ width: boardExtent.w, height: boardExtent.h }}
              onPointerDown={(e) => {
                if (toolMode !== 'pan') return;
                const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                const move = (ev: PointerEvent) => setPan({ x: ev.clientX - start.x, y: ev.clientY - start.y });
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              <div
                className="studio-board-transform"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <svg className="studio-board-edges" width={boardExtent.w} height={boardExtent.h} aria-hidden="true">
                  {doc.edges.map((edge) => {
                    const from = nodeById(doc, edge.from);
                    const to = nodeById(doc, edge.to);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={edge.id}
                        data-testid={`board-edge-${edge.id}`}
                        x1={from.x + NODE_WIDTH}
                        y1={from.y + NODE_HEIGHT / 2}
                        x2={to.x}
                        y2={to.y + NODE_HEIGHT / 2}
                        stroke="currentColor"
                      />
                    );
                  })}
                </svg>
                {doc.nodes.map((node) => {
                  const offset = dragOffset?.id === node.id ? dragOffset : { dx: 0, dy: 0 };
                  return (
                    <article
                      key={node.id}
                      className="studio-board-node"
                      data-testid={`board-node-${node.id}`}
                      data-type={node.type}
                      style={{
                        left: node.x + offset.dx,
                        top: node.y + offset.dy,
                        width: NODE_WIDTH,
                        minHeight: NODE_HEIGHT,
                      }}
                      onClick={() => handleNodeClick(node)}
                      onPointerDown={(e) => {
                        if (toolMode !== 'select') return;
                        const origin = { x: e.clientX, y: e.clientY };
                        dragRef.current = { id: node.id, dx: 0, dy: 0 };
                        const move = (ev: PointerEvent) => {
                          const dx = ev.clientX - origin.x;
                          const dy = ev.clientY - origin.y;
                          dragRef.current = { id: node.id, dx, dy };
                          setDragOffset({ id: node.id, dx, dy });
                        };
                        const up = () => {
                          window.removeEventListener('pointermove', move);
                          window.removeEventListener('pointerup', up);
                          const drag = dragRef.current;
                          dragRef.current = null;
                          setDragOffset(null);
                          if (drag && (drag.dx !== 0 || drag.dy !== 0)) {
                            commit(moveNodeBy(doc, node.id, drag.dx, drag.dy));
                          }
                        };
                        window.addEventListener('pointermove', move);
                        window.addEventListener('pointerup', up);
                      }}
                    >
                      {renderNodeBody(node)}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {minimapOpen && (
            <div className="studio-board-minimap" data-testid="board-minimap" aria-label="Minimap">
              <svg width={192} height={96}>
                {doc.nodes.map((node) => (
                  <rect
                    key={node.id}
                    data-testid={`board-minimap-node-${node.id}`}
                    x={(node.x / boardExtent.w) * 192}
                    y={(node.y / boardExtent.h) * 96}
                    width={Math.max(4, (NODE_WIDTH / boardExtent.w) * 192)}
                    height={Math.max(3, (NODE_HEIGHT / boardExtent.h) * 96)}
                  />
                ))}
              </svg>
            </div>
          )}

          {/* --------------------------------------------- wires list */}
          {doc.edges.length > 0 && (
            <div className="studio-board-wires">
              <h3>Wires</h3>
              <ul>
                {doc.edges.map((edge) => (
                  <li key={edge.id} data-testid={`board-wire-${edge.id}`}>
                    <span>{edgeBindingLabel(doc, edge)}</span>
                    <button type="button" onClick={() => commit(disconnectEdge(doc, edge.id))}>
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {refusal && (
            <p className="studio-board-refusal" data-testid="board-connect-refusal" role="alert">
              {refusal}
            </p>
          )}
          {connectFrom && (
            <p className="studio-board-connecting" data-testid="board-connecting" role="status">
              Wiring from {nodeById(doc, connectFrom)?.title} — click the node it should feed.
            </p>
          )}

          {/* --------------------------------------------- run plan */}
          <div className="studio-board-run">
            <button type="button" data-testid="board-run" onClick={runBoard}>
              Run Board
            </button>
            <button
              type="button"
              data-testid="board-save-pipeline"
              onClick={() => {
                onSavePipeline?.(doc);
                setPipelineSaved(true);
              }}
            >
              Save as Reusable Pipeline
            </button>
            {pipelineSaved && (
              <span data-testid="board-pipeline-saved" role="status">
                Saved to My Pipelines on the Board home, in {BOARD_RUN_TOOL}&rsquo;s definition shape.
              </span>
            )}
            {runPlan && (
              <div className="studio-board-runplan" data-testid="board-runplan">
                <h3>Run plan — {BOARD_RUN_TOOL}</h3>
                {runPlan.steps.length === 0 ? (
                  <p data-testid="board-runplan-empty">
                    Nothing to run yet: the board has no generator or assistant steps. Add one and wire
                    its inputs — the plan prices each step before anything could execute.
                  </p>
                ) : (
                  <>
                    <ul>
                      {runPlan.steps.map((step) => (
                        <li key={step.nodeId} data-testid={`board-runstep-${step.nodeId}`}>
                          <strong>{step.title}</strong> — {step.outcome === 'blocked' ? 'blocked' : `${step.quoteCredits} credits`}
                          <span className="studio-board-runstep-reason"> {step.reason}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="studio-board-runplan-total" data-testid="board-runplan-total">
                      Total if it ran: {runPlan.totalCredits} credits · Charged now: {runPlan.chargedCredits}{' '}
                      credits — a plan is not a spend.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <JobStrip jobs={jobs} />
        </div>

        {/* --------------------------------------------- expanded panel */}
        {selected && (
          <aside className="studio-board-panel" data-testid="board-node-panel" aria-label="Node settings">
            <h3>{nodeMeta(selected.type).label}</h3>
            <label>
              Title
              <input
                type="text"
                data-testid="board-node-title"
                value={selected.title}
                onChange={(e) => commit(updateNode(doc, selected.id, { title: e.target.value }))}
              />
            </label>

            {(selected.type === 'prompt' ||
              selected.type === 'sticky' ||
              selected.type === 'text' ||
              selected.type === 'comment' ||
              selected.type === 'assistant' ||
              isGeneratorType(selected.type)) && (
              <label>
                {isGeneratorType(selected.type) ? 'Prompt' : 'Text'}
                <textarea
                  data-testid="board-node-text"
                  value={selected.text}
                  onChange={(e) => commit(updateNode(doc, selected.id, { text: e.target.value }))}
                />
              </label>
            )}

            {selected.type === 'comment' && (
              <label>
                <input
                  type="checkbox"
                  data-testid="board-node-resolved"
                  checked={selected.resolved}
                  onChange={(e) => commit(updateNode(doc, selected.id, { resolved: e.target.checked }))}
                /> Resolved
              </label>
            )}

            {isGeneratorType(selected.type) && selected.settings && (
              <div className="studio-board-gen-settings" data-testid="board-gen-settings">
                {(() => {
                  const kind = generationKindFor(selected.type)!;
                  const settings = selected.settings as ComposerSettings;
                  const patch = (p: Partial<ComposerSettings>) =>
                    commit(updateNode(doc, selected.id, { settings: { ...settings, ...p } }));
                  const quote = nodeQuote(selected);
                  return (
                    <>
                      <label>
                        Model
                        <select
                          data-testid="board-gen-model"
                          value={settings.modelId}
                          onChange={(e) => patch({ modelId: e.target.value })}
                        >
                          {STUDIO_MODEL_RATES[kind].map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.label} — {rate.note}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Aspect ratio
                        <select
                          data-testid="board-gen-ratio"
                          value={settings.ratio}
                          onChange={(e) => patch({ ratio: e.target.value })}
                        >
                          {RATIOS.map((ratio) => (
                            <option key={ratio} value={ratio}>
                              {ratio}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Resolution / quality
                        <select
                          data-testid="board-gen-resolution"
                          value={settings.resolution}
                          onChange={(e) => patch({ resolution: e.target.value })}
                        >
                          {(RESOLUTIONS[kind] ?? ['Standard']).map((res) => (
                            <option key={res} value={res}>
                              {res}
                            </option>
                          ))}
                        </select>
                      </label>
                      {kind !== 'image' && (
                        <label>
                          Duration (seconds)
                          <input
                            type="number"
                            data-testid="board-gen-duration"
                            min={1}
                            max={60}
                            value={settings.durationSeconds}
                            onChange={(e) => patch({ durationSeconds: Number(e.target.value) || 0 })}
                          />
                        </label>
                      )}
                      <label>
                        Batch
                        <input
                          type="number"
                          data-testid="board-gen-batch"
                          min={1}
                          max={4}
                          value={settings.batch}
                          onChange={(e) => patch({ batch: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })}
                        />
                      </label>
                      <p className="studio-board-gen-quote" data-testid="board-gen-quote">
                        {quote ? `${quote.modelLabel} · ${quote.credits} credits` : '—'}
                      </p>
                      <button type="button" data-testid="board-gen-generate" disabled aria-disabled="true">
                        {quote ? `Generate · ${quote.credits} credits` : 'Generate · —'}
                      </button>
                      <p className="studio-board-gen-off" data-testid="board-gen-not-configured" role="note">
                        Generation is not configured yet — {twinToolFor(selected.type)} has no provider
                        connected (NOT_CONFIGURED). The price above is the real quote; nothing will be
                        charged and no result will be invented.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            {(selected.type === 'asset' || selected.type === 'reference' || selected.type === 'upload') && (
              <div className="studio-board-bind" data-testid="board-bind">
                <h4>{selected.assetId ? 'Bound media' : 'Bind one of your assets'}</h4>
                {selected.assetId ? (
                  <>
                    <p data-testid="board-bound-name">{selected.filename}</p>
                    <button
                      type="button"
                      onClick={() =>
                        commit(updateNode(doc, selected.id, { assetId: null, filename: null, url: null, mediaKind: null }))
                      }
                    >
                      Unbind
                    </button>
                  </>
                ) : assetsState === 'loading' ? (
                  <p data-testid="board-assets-loading">Loading your assets…</p>
                ) : assetsState === 'error' ? (
                  <div data-testid="board-assets-error" role="alert">
                    <p>{assetsError ?? 'Your assets could not be loaded.'}</p>
                    <button type="button" onClick={() => onRetryAssets?.()}>
                      Retry
                    </button>
                  </div>
                ) : pickable.length === 0 ? (
                  <p data-testid="board-assets-empty">
                    No ready assets yet — upload a photo in Image Studio and it can be bound here.
                  </p>
                ) : (
                  <ul className="studio-board-asset-list">
                    {pickable.map((asset) => (
                      <li key={asset.id}>
                        <button
                          type="button"
                          data-testid={`board-bind-${asset.id}`}
                          onClick={() => commit(bindAssetToNode(doc, selected.id, asset))}
                        >
                          {asset.url && <img src={asset.url} alt={asset.filename} />}
                          <span>{asset.filename}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {selected.type === 'folder' && (
              <div className="studio-board-folder-members" data-testid="board-folder-members">
                <h4>Grouped nodes</h4>
                {doc.nodes
                  .filter((n) => n.id !== selected.id && n.type !== 'folder')
                  .map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        data-testid={`board-folder-member-${n.id}`}
                        checked={selected.memberIds.includes(n.id)}
                        onChange={(e) =>
                          commit(
                            updateNode(doc, selected.id, {
                              memberIds: e.target.checked
                                ? [...selected.memberIds, n.id]
                                : selected.memberIds.filter((m) => m !== n.id),
                            }),
                          )
                        }
                      />{' '}
                      {n.title}
                    </label>
                  ))}
              </div>
            )}

            {/* wiring into this node */}
            <div className="studio-board-wire-in" data-testid="board-wire-in">
              <h4>Wire into this node</h4>
              <p className="studio-board-wire-note">
                {doc.nodes.length < 2
                  ? 'Add another node first — a wire needs two ends.'
                  : 'Pick a source below — sources that cannot feed this node say why.'}
              </p>
              <ul>
                {doc.nodes
                  .filter((n) => n.id !== selected.id)
                  .map((n) => {
                    const check = canConnect(doc, n.id, selected.id);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          data-testid={`board-wire-from-${n.id}`}
                          disabled={!check.ok}
                          title={check.ok ? undefined : check.reason}
                          onClick={() => handleWireFrom(n.id)}
                        >
                          {n.title}
                        </button>
                        {!check.ok && <span className="studio-board-wire-reason"> {check.reason}</span>}
                      </li>
                    );
                  })}
              </ul>
            </div>

            <div className="studio-board-node-move">
              <h4>Move</h4>
              <button type="button" data-testid="board-move-left" onClick={() => commit(moveNodeBy(doc, selected.id, -20, 0))}>
                ←
              </button>
              <button type="button" data-testid="board-move-right" onClick={() => commit(moveNodeBy(doc, selected.id, 20, 0))}>
                →
              </button>
              <button type="button" data-testid="board-move-up" onClick={() => commit(moveNodeBy(doc, selected.id, 0, -20))}>
                ↑
              </button>
              <button type="button" data-testid="board-move-down" onClick={() => commit(moveNodeBy(doc, selected.id, 0, 20))}>
                ↓
              </button>
            </div>

            <button
              type="button"
              data-testid="board-node-delete"
              onClick={() => {
                commit(removeNode(doc, selected.id));
                setSelectedId(null);
              }}
            >
              Delete node
            </button>
          </aside>
        )}

        {/* --------------------------------------------- slide-overs */}
        {panel === 'assistant' && (
          <aside className="studio-board-slideover">
            <BoardAssistant />
          </aside>
        )}
        {panel === 'chat' && (
          <aside className="studio-board-slideover">
            <BoardTeamChat boardTitle={doc.title} />
          </aside>
        )}
        {panel === 'share' && (
          <aside className="studio-board-slideover">
            <BoardShare boardId={doc.id} boardTitle={doc.title} />
          </aside>
        )}
      </div>

      {/* ------------------------------------------------ bottom toolbar */}
      <div className="studio-board-toolbar" role="toolbar" aria-label="Board toolbar">
        <button type="button" data-testid="board-tool-select" aria-pressed={toolMode === 'select'} onClick={() => setToolMode('select')}>
          Select
        </button>
        <button type="button" data-testid="board-tool-pan" aria-pressed={toolMode === 'pan'} onClick={() => setToolMode('pan')}>
          Pan
        </button>
        <button
          type="button"
          data-testid="board-tool-connect"
          aria-pressed={toolMode === 'connect'}
          onClick={() => {
            setToolMode(toolMode === 'connect' ? 'select' : 'connect');
            setConnectFrom(null);
          }}
        >
          Connector
        </button>
        <button type="button" disabled aria-disabled="true" title="Freehand drawing arrives in a later unit">
          Draw
        </button>
        <button type="button" disabled aria-disabled="true" title="Shape objects arrive in a later unit">
          Shape
        </button>
        <button type="button" data-testid="board-tool-sticky" onClick={() => handleAddNode('sticky')}>
          Sticky Note
        </button>
        <button type="button" data-testid="board-tool-text" onClick={() => handleAddNode('text')}>
          Text
        </button>
        <button type="button" data-testid="board-tool-comment" onClick={() => handleAddNode('comment')}>
          Comment
        </button>
        <button type="button" data-testid="board-tool-image" onClick={() => handleAddNode('asset')}>
          Image
        </button>
        <button type="button" data-testid="board-add-node" onClick={() => setAddMenuOpen((open) => !open)}>
          + Add Node
        </button>
      </div>

      {addMenuOpen && (
        <ul className="studio-board-addmenu" data-testid="board-add-menu" aria-label="Add a node">
          {BOARD_NODE_TYPES.map((meta) => (
            <li key={meta.type}>
              <button type="button" data-testid={`board-add-${meta.type}`} onClick={() => handleAddNode(meta.type)}>
                <strong>{meta.label}</strong> — {meta.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default BoardScreen;
