// ============================================================================
// QuantCooks Studio (Phase 2 Unit 6) — Canvas Board: lib logic + rendering.
// Same approach as Units 1–5: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. Interaction-only
// state is proven the established way: the pure lib functions carry the
// rules (graph CRUD, edge rules with reasons, the run plan), and
// components render with the initial props a click would have produced.
// The honesty proofs this unit owes:
//  - a run produces a priced PLAN and nothing else: every step lands
//    NOT_CONFIGURED naming its twin, the charge is provably 0, and no
//    output/result is ever fabricated;
//  - the assistant's outcome type carries no nodes, so "Ask Quanty" can
//    never pretend it built a graph;
//  - every starter template's own wires pass the board's own edge rules.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import { computeQuote } from '../lib/studio/pricing';
import {
  BOARD_ASSISTANT_ACTIONS,
  BOARD_NODE_TYPES,
  BOARD_PLAN_TOOL,
  BOARD_RUN_TOOL,
  BOARD_STARTERS,
  addNode,
  arrangeBoard,
  attemptBoardPlan,
  bindAssetToNode,
  canConnect,
  connectNodes,
  defaultNodeSettings,
  deleteBoard,
  disconnectEdge,
  edgeBindingLabel,
  effectivePrompt,
  emptyBoardDoc,
  emptyNode,
  historyOf,
  historyPush,
  historyRedo,
  historyUndo,
  instantiateStarter,
  loadBoardDoc,
  loadBoardIndex,
  loadPipelines,
  moveNodeBy,
  nextBoardId,
  nodeQuote,
  pickableBoardAssets,
  pipelineFromBoard,
  planBoardRun,
  parseBoardDoc,
  removeNode,
  renameBoard,
  saveBoardDoc,
  savePipeline,
  starterById,
  topologicalOrder,
  updateNode,
  type BoardDoc,
  type BoardStorageLike,
} from '../lib/studio/board';
import { BoardHome } from '../components/studio/BoardHome';
import { BoardScreen } from '../components/studio/BoardScreen';
import { BoardAssistant, BoardShare, BoardTeamChat } from '../components/studio/BoardPanels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'thali-hero.jpg',
  type: 'image',
  size: 4096,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/thali-hero.jpg',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/thali-hero.jpg',
  ...over,
});

function fakeStorage(): BoardStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** A doc with the given node types added in order (ids node-1, node-2…). */
function docWith(types: Parameters<typeof addNode>[1][]): BoardDoc {
  let doc = emptyBoardDoc('board-1');
  for (const type of types) doc = addNode(doc, type);
  return doc;
}

// ---------------------------------------------------------------------------
// Node CRUD
// ---------------------------------------------------------------------------

describe('board node CRUD', () => {
  it('adds nodes with deterministic ids and kind-correct default settings', () => {
    const doc = docWith(['prompt', 'image-generator']);
    expect(doc.nodes.map((n) => n.id)).toEqual(['node-1', 'node-2']);
    expect(doc.nodes[1]!.settings?.modelId).toBe('qc-still-standard');
    expect(doc.nodes[0]!.settings).toBeNull();
  });

  it('updates, moves (clamped at the board edge) and renames', () => {
    let doc = docWith(['sticky']);
    doc = updateNode(doc, 'node-1', { text: 'Steam first, then the pour.' });
    expect(doc.nodes[0]!.text).toContain('Steam first');
    doc = moveNodeBy(doc, 'node-1', -9999, 15);
    expect(doc.nodes[0]!.x).toBe(0); // clamped at the board's left edge
    expect(doc.nodes[0]!.y).toBe(63);
  });

  it('moveNodeBy never takes a node off the top-left of the board', () => {
    const node = emptyNode('node-1', 'text', 30, 10);
    const doc: BoardDoc = { id: 'b', title: 't', nodes: [node], edges: [] };
    const moved = moveNodeBy(doc, 'node-1', -50, -50);
    expect(moved.nodes[0]!.x).toBe(0);
    expect(moved.nodes[0]!.y).toBe(0);
    expect(renameBoard(doc, '  ').title).toBe('Untitled board');
    expect(renameBoard(doc, ' Diwali chain ').title).toBe('Diwali chain');
  });

  it('removing a node removes its wires and its folder membership', () => {
    let doc = docWith(['asset', 'image-generator', 'folder']);
    doc = updateNode(doc, 'node-3', { memberIds: ['node-1'] });
    const wired = connectNodes(doc, 'node-1', 'node-2');
    expect(wired.status).toBe('connected');
    if (wired.status === 'connected') doc = wired.doc;
    doc = removeNode(doc, 'node-1');
    expect(doc.nodes.map((n) => n.id)).toEqual(['node-2', 'node-3']);
    expect(doc.edges).toHaveLength(0);
    expect(doc.nodes.find((n) => n.id === 'node-3')!.memberIds).toEqual([]);
  });

  it('arrange lays nodes out in run order', () => {
    let doc = docWith(['video-generator', 'image-generator']);
    const wired = connectNodes(doc, 'node-2', 'node-1');
    if (wired.status === 'connected') doc = wired.doc;
    const arranged = arrangeBoard(doc);
    const first = arranged.nodes.find((n) => n.id === 'node-2')!;
    const second = arranged.nodes.find((n) => n.id === 'node-1')!;
    expect(first.x).toBeLessThan(second.x);
  });
});

// ---------------------------------------------------------------------------
// Asset binding — READY only
// ---------------------------------------------------------------------------

describe('board asset binding', () => {
  it('pickable assets are READY only; PENDING never binds', () => {
    const ready = asset({});
    const pending = asset({ id: 'asset-2', uploadStatus: 'PENDING', url: null });
    expect(pickableBoardAssets([ready, pending]).map((a) => a.id)).toEqual(['asset-1']);

    let doc = docWith(['asset']);
    doc = bindAssetToNode(doc, 'node-1', pending);
    expect(doc.nodes[0]!.assetId).toBeNull();
    doc = bindAssetToNode(doc, 'node-1', ready);
    expect(doc.nodes[0]!.assetId).toBe('asset-1');
    expect(doc.nodes[0]!.mediaKind).toBe('image');
    expect(doc.nodes[0]!.title).toBe('thali-hero.jpg');
  });
});

// ---------------------------------------------------------------------------
// Edge rules — allowed, refused with reasons, cycles refused
// ---------------------------------------------------------------------------

describe('board edge rules', () => {
  it('allows the chain shapes the studios use', () => {
    const doc = docWith(['prompt', 'image-generator', 'video-generator', 'output', 'voice-generator']);
    expect(canConnect(doc, 'node-1', 'node-2').ok).toBe(true); // prompt → image
    expect(canConnect(doc, 'node-2', 'node-3').ok).toBe(true); // image → video
    expect(canConnect(doc, 'node-3', 'node-4').ok).toBe(true); // video → output
    expect(canConnect(doc, 'node-1', 'node-5').ok).toBe(true); // prompt → voice (a script)
  });

  it('refuses media that does not fit, with the reason printed', () => {
    let doc = docWith(['asset', 'image-generator']);
    doc = bindAssetToNode(doc, 'node-1', asset({ type: 'audio', filename: 'narration.mp3' }));
    const check = canConnect(doc, 'node-1', 'node-2');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain('still');
  });

  it('refuses a media wire into the Voice Generator — it takes words', () => {
    let doc = docWith(['asset', 'voice-generator']);
    doc = bindAssetToNode(doc, 'node-1', asset({ type: 'video', filename: 'reel.mp4' }));
    const check = canConnect(doc, 'node-1', 'node-2');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain('words');
  });

  it('refuses sources, sinks and furniture as the wrong end of a wire', () => {
    const doc = docWith(['prompt', 'image-generator', 'output', 'sticky']);
    expect(canConnect(doc, 'node-1', 'node-1').ok).toBe(false); // self
    expect(canConnect(doc, 'node-2', 'node-1').ok).toBe(false); // into a source
    expect(canConnect(doc, 'node-3', 'node-2').ok).toBe(false); // out of the sink
    const furniture = canConnect(doc, 'node-4', 'node-2');
    expect(furniture.ok).toBe(false);
    if (!furniture.ok) expect(furniture.reason).toContain('furniture');
    const words = canConnect(doc, 'node-1', 'node-3');
    expect(words.ok).toBe(false); // prompt → output
    if (!words.ok) expect(words.reason).toContain('finished media');
  });

  it('refuses duplicates and cycles, and disconnect removes a wire', () => {
    let doc = docWith(['video-generator', 'ad-generator']);
    const first = connectNodes(doc, 'node-1', 'node-2');
    expect(first.status).toBe('connected');
    if (first.status === 'connected') doc = first.doc;
    const dupe = connectNodes(doc, 'node-1', 'node-2');
    expect(dupe.status).toBe('refused');
    if (dupe.status === 'refused') expect(dupe.reason).toContain('already feeds');

    // Ad carries video and Video Generator takes video, so the media fit
    // passes — the refusal must come from the cycle rule itself.
    const cycle = connectNodes(doc, 'node-2', 'node-1');
    expect(cycle.status).toBe('refused');
    if (cycle.status === 'refused') expect(cycle.reason).toContain('loop');

    expect(doc.edges).toHaveLength(1);
    expect(edgeBindingLabel(doc, doc.edges[0]!)).toContain('input for');
    doc = disconnectEdge(doc, doc.edges[0]!.id);
    expect(doc.edges).toHaveLength(0);
  });

  it('an unbound Upload slot wires structurally — fit is decided at binding', () => {
    const doc = docWith(['upload', 'image-generator']);
    expect(canConnect(doc, 'node-1', 'node-2').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quotes and the run plan — priced, ordered, never charged, never faked
// ---------------------------------------------------------------------------

describe('board quotes and run plan', () => {
  it('a node quote IS computeQuote for its kind and settings', () => {
    const node = emptyNode('node-1', 'video-generator', 0, 0);
    const quote = nodeQuote(node);
    expect(quote).not.toBeNull();
    expect(quote!.credits).toBe(computeQuote('video', defaultNodeSettings('video')).credits);
    expect(nodeQuote(emptyNode('node-2', 'prompt', 0, 0))).toBeNull();
  });

  it('the run walks in topological order and sums the step quotes', () => {
    let doc = docWith(['image-generator', 'video-generator']);
    doc = updateNode(doc, 'node-1', { text: 'Restyle the thali shot.' });
    doc = updateNode(doc, 'node-2', { text: 'Animate it.' });
    const wired = connectNodes(doc, 'node-1', 'node-2');
    if (wired.status === 'connected') doc = wired.doc;

    expect(topologicalOrder(doc)).toEqual(['node-1', 'node-2']);
    const plan = planBoardRun(doc, false);
    expect(plan.tool).toBe(BOARD_RUN_TOOL);
    expect(plan.steps.map((s) => s.nodeId)).toEqual(['node-1', 'node-2']);
    const expected =
      computeQuote('image', defaultNodeSettings('image')).credits +
      computeQuote('video', defaultNodeSettings('video')).credits;
    expect(plan.totalCredits).toBe(expected);
    expect(plan.chargedCredits).toBe(0);
    for (const step of plan.steps) {
      expect(step.outcome).toBe('not-configured');
      expect(step.reason).toContain('NOT_CONFIGURED');
      expect(step.reason).toContain(step.twin);
    }
    // The plan carries no outputs — nothing was executed or invented.
    expect(JSON.stringify(plan)).not.toContain('outputs');
  });

  it('a generator with no prompt is BLOCKED and excluded from the total', () => {
    let doc = docWith(['image-generator', 'video-generator']);
    doc = updateNode(doc, 'node-2', { text: 'Animate the hero still.' });
    const plan = planBoardRun(doc, false);
    const blocked = plan.steps.find((s) => s.nodeId === 'node-1')!;
    expect(blocked.outcome).toBe('blocked');
    expect(blocked.reason).toContain('no words yet');
    expect(plan.totalCredits).toBe(computeQuote('video', defaultNodeSettings('video')).credits);
  });

  it('a wired Prompt supplies the words — effectivePrompt reads through the wire', () => {
    let doc = docWith(['prompt', 'image-generator']);
    doc = updateNode(doc, 'node-1', { text: 'A brass thali at golden hour.' });
    const wired = connectNodes(doc, 'node-1', 'node-2');
    if (wired.status === 'connected') doc = wired.doc;
    const gen = doc.nodes.find((n) => n.id === 'node-2')!;
    expect(effectivePrompt(doc, gen)).toBe('A brass thali at golden hour.');
    const plan = planBoardRun(doc, false);
    expect(plan.steps[0]!.outcome).toBe('not-configured');
    expect(plan.steps[0]!.inputs).toContain('Prompt');
  });

  it('an Assistant step is a free plan step, not-configured with its own code', () => {
    const doc = docWith(['assistant']);
    const plan = planBoardRun(doc, false);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.twin).toBe(BOARD_PLAN_TOOL);
    expect(plan.steps[0]!.quoteCredits).toBe(0);
    expect(plan.steps[0]!.reason).toContain('PLANNER_NOT_CONFIGURED');
    expect(plan.totalCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

describe('board history', () => {
  it('push, undo and redo walk the document honestly', () => {
    const empty = emptyBoardDoc('board-1');
    let history = historyOf(empty);
    const withNode = addNode(empty, 'prompt');
    history = historyPush(history, withNode);
    expect(history.present.nodes).toHaveLength(1);
    history = historyUndo(history);
    expect(history.present.nodes).toHaveLength(0);
    history = historyRedo(history);
    expect(history.present.nodes).toHaveLength(1);
    expect(historyUndo(historyOf(empty)).present).toBe(empty);
  });
});

// ---------------------------------------------------------------------------
// Starters — their own wires must pass the board's own rules
// ---------------------------------------------------------------------------

describe('board starters', () => {
  it('ships the three checklist templates', () => {
    expect(BOARD_STARTERS.map((s) => s.name)).toEqual([
      'Recipe Reel Pipeline',
      'Menu Ad Chain',
      'Dub-a-Reel',
    ]);
    expect(starterById('dub-a-reel')?.name).toBe('Dub-a-Reel');
    expect(starterById('nope')).toBeNull();
  });

  it('every starter instantiates into a valid board whose wires all connect', () => {
    for (const starter of BOARD_STARTERS) {
      const doc = instantiateStarter('board-9', starter);
      expect(doc.title).toBe(starter.name);
      expect(doc.nodes).toHaveLength(starter.nodes.length);
      expect(doc.edges).toHaveLength(starter.edges.length);
      for (const edge of doc.edges) {
        expect(canConnect({ ...doc, edges: doc.edges.filter((e) => e.id !== edge.id) }, edge.from, edge.to).ok).toBe(true);
      }
      // Media slots arrive unbound — a template never borrows an asset.
      for (const node of doc.nodes) expect(node.assetId).toBeNull();
    }
  });

  it('an instantiated starter prices its run like any board', () => {
    const doc = instantiateStarter('board-9', starterById('recipe-reel-pipeline')!);
    const plan = planBoardRun(doc, false);
    expect(plan.steps.map((s) => s.outcome)).toEqual(['not-configured', 'not-configured']);
    expect(plan.totalCredits).toBe(
      computeQuote('image', defaultNodeSettings('image')).credits +
        computeQuote('video', defaultNodeSettings('video')).credits,
    );
  });
});

// ---------------------------------------------------------------------------
// The draft mirror — round-trip, pipelines, defensive parsing
// ---------------------------------------------------------------------------

describe('board draft mirror', () => {
  it('round-trips a board through the index and the document store', () => {
    const storage = fakeStorage();
    let doc = docWith(['prompt', 'video-generator']);
    doc = updateNode(doc, 'node-2', { text: 'Animate the still.' });
    doc = renameBoard(doc, 'Diwali chain');
    saveBoardDoc(storage, doc, '2026-10-29T10:00:00.000Z');

    const index = loadBoardIndex(storage);
    expect(index).toEqual([{ id: 'board-1', title: 'Diwali chain', updatedAt: '2026-10-29T10:00:00.000Z' }]);
    const loaded = loadBoardDoc(storage, 'board-1');
    expect(loaded).toEqual(doc);
    expect(nextBoardId(index)).toBe('board-2');

    deleteBoard(storage, 'board-1');
    expect(loadBoardIndex(storage)).toEqual([]);
    expect(loadBoardDoc(storage, 'board-1')).toBeNull();
  });

  it('a saved pipeline keeps run_pipeline’s definition shape', () => {
    const storage = fakeStorage();
    const doc = instantiateStarter('board-1', starterById('menu-ad-chain')!);
    const pipeline = pipelineFromBoard(doc, 'pipeline-1', '2026-10-29T10:00:00.000Z');
    expect(Object.keys(pipeline.definition).sort()).toEqual(['edges', 'nodes']);
    savePipeline(storage, pipeline);
    const loaded = loadPipelines(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('Menu Ad Chain');
    expect(loaded[0]!.definition.nodes).toHaveLength(doc.nodes.length);
  });

  it('malformed mirror data is dropped piece by piece, never trusted', () => {
    const parsed = parseBoardDoc(
      JSON.stringify({
        id: 'board-7',
        title: 'Kept',
        nodes: [
          { id: 'node-1', type: 'prompt', text: 'hi' },
          { id: 'node-2', type: 'time-machine', text: 'bogus' },
          { nope: true },
        ],
        edges: [
          { id: 'edge-1', from: 'node-1', to: 'node-2' },
          { id: 'edge-2', from: 'node-1', to: 'node-1' },
        ],
      }),
      'board-7',
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes.map((n) => n.id)).toEqual(['node-1']);
    // edge-1 points at a dropped node, edge-2 is kept structurally (self
    // wires can only be refused at connect time; parse keeps data honest).
    expect(parsed!.edges.map((e) => e.id)).toEqual(['edge-2']);
    expect(parseBoardDoc('{not json', 'b')).toBeNull();
    expect(parseBoardDoc(null, 'b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The assistant — the ask is preserved; the outcome carries no nodes
// ---------------------------------------------------------------------------

describe('board assistant outcome', () => {
  it('an empty ask is invalid; a real ask lands not-configured, verbatim', () => {
    expect(attemptBoardPlan('   ').status).toBe('invalid');
    const outcome = attemptBoardPlan('Turn my dal fry photo into a reel and an ad.');
    expect(outcome.status).toBe('not-configured');
    if (outcome.status === 'not-configured') {
      expect(outcome.ask).toBe('Turn my dal fry photo into a reel and an ad.');
      expect(outcome.tool).toBe(BOARD_PLAN_TOOL);
      expect(outcome.message).toContain('PLANNER_NOT_CONFIGURED');
      expect(outcome.message).toContain('nothing was charged');
    }
    // The honesty proof: the outcome type has no nodes to pretend with.
    expect('nodes' in outcome).toBe(false);
  });

  it('the four quick actions are the spec’s set', () => {
    expect(BOARD_ASSISTANT_ACTIONS.map((a) => a.label)).toEqual([
      'Create a pipeline',
      'Turn ideas into nodes',
      'Build from a reference',
      'Turn this prompt into nodes',
    ]);
    expect(BOARD_NODE_TYPES.length).toBe(14);
  });
});


// ---------------------------------------------------------------------------
// Rendering — Board home (#47)
// ---------------------------------------------------------------------------

const render = (element: React.ReactElement): string => renderToStaticMarkup(element);

describe('BoardHome rendering', () => {
  it('loading state renders skeletons', () => {
    const html = render(React.createElement(BoardHome, { boardsState: 'loading' }));
    expect(html).toContain('board-home-loading');
  });

  it('error state prints the real message and a retry', () => {
    const html = render(
      React.createElement(BoardHome, {
        boardsState: 'error',
        boardsError: 'Storage is unavailable on this device.',
      }),
    );
    expect(html).toContain('board-home-error');
    expect(html).toContain('Storage is unavailable on this device.');
    expect(html).toContain('Retry');
  });

  it('empty state: no boards, create action, the three templates, device honesty', () => {
    const html = render(
      React.createElement(BoardHome, {
        boardsState: 'ready',
        boards: [],
        onCreateBoard: () => 'board-1',
        onInstantiateStarter: () => 'board-2',
      }),
    );
    expect(html).toContain('board-home-empty');
    expect(html).toContain('No boards yet');
    expect(html).toContain('board-create');
    expect(html).toContain('Recipe Reel Pipeline');
    expect(html).toContain('Menu Ad Chain');
    expect(html).toContain('Dub-a-Reel');
    expect(html).toContain('Draft on this device');
    expect(html).toContain('board-pipelines-empty');
  });

  it('populated state: board cards link to their routes, pipelines listed', () => {
    const doc = instantiateStarter('board-1', starterById('recipe-reel-pipeline')!);
    const pipeline = pipelineFromBoard(doc, 'pipeline-1', '2026-10-29T10:00:00.000Z');
    const html = render(
      React.createElement(BoardHome, {
        boardsState: 'ready',
        boards: [{ id: 'board-1', title: 'Recipe Reel Pipeline', updatedAt: '2026-10-29T10:00:00.000Z' }],
        pipelines: [pipeline],
        onDeleteBoard: () => undefined,
      }),
    );
    expect(html).toContain('board-card-board-1');
    expect(html).toContain('href="/studio/board/board-1"');
    expect(html).toContain('board-pipeline-pipeline-1');
    expect(html).toContain('4 nodes · 3 wires');
  });
});

// ---------------------------------------------------------------------------
// Rendering — Board screen (#48/#49)
// ---------------------------------------------------------------------------

describe('BoardScreen rendering', () => {
  it('empty board: starter inserts, hint card, toolbar, device note', () => {
    const html = render(
      React.createElement(BoardScreen, { initialDoc: emptyBoardDoc('board-1'), assetsState: 'ready' }),
    );
    expect(html).toContain('board-empty');
    expect(html).toContain('Prompt Box');
    expect(html).toContain('Image Generator');
    expect(html).toContain('Video Generator');
    expect(html).toContain('board-hint');
    expect(html).toContain('board-add-node');
    expect(html).toContain('Draft on this device');
    expect(html).toContain('jobstrip-empty');
  });

  it('populated board: node cards, wires, quotes and the output’s inputs', () => {
    const doc = instantiateStarter('board-1', starterById('recipe-reel-pipeline')!);
    const html = render(React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready' }));
    expect(html).toContain('board-node-node-1');
    expect(html).toContain('board-node-node-4');
    expect(html).toContain('board-edge-edge-1');
    expect(html).toContain('board-wire-edge-1');
    expect(html).toContain('input for Reel clip');
    expect(html).toContain('Generate · 2 credits'); // hero still, QC Still base
    expect(html).toContain('Generate · 8 credits'); // reel clip, QC Motion base
    expect(html).toContain('Collects: Reel clip');
    expect(html).toContain('Empty slot — bind media when the pipeline runs.');
  });

  it('run plan renders priced steps, the total, and a zero charge', () => {
    const doc = instantiateStarter('board-1', starterById('recipe-reel-pipeline')!);
    const html = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready', initialRunRequested: true }),
    );
    expect(html).toContain('board-runplan');
    expect(html).toContain(BOARD_RUN_TOOL);
    expect(html).toContain('Total if it ran: 10 credits · Charged now: 0');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('board-node-step-node-2');
  });

  it('the expanded generator panel is the same node, bigger: settings + honest Generate', () => {
    const doc = instantiateStarter('board-1', starterById('recipe-reel-pipeline')!);
    const html = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready', initialSelectedId: 'node-3' }),
    );
    expect(html).toContain('board-node-panel');
    expect(html).toContain('board-gen-settings');
    expect(html).toContain('board-gen-not-configured');
    expect(html).toContain('quantcooks.generate_video_from_text');
    expect(html).toContain('Generate · 8 credits');
  });

  it('the binding panel offers READY assets only, and states cover the rest', () => {
    const doc = instantiateStarter('board-1', starterById('recipe-reel-pipeline')!);
    const ready = asset({});
    const pending = asset({ id: 'asset-2', filename: 'still-uploading.jpg', uploadStatus: 'PENDING', url: null });
    const html = render(
      React.createElement(BoardScreen, {
        initialDoc: doc,
        assetsState: 'ready',
        assets: [ready, pending],
        initialSelectedId: 'node-1',
      }),
    );
    expect(html).toContain('board-bind-asset-1');
    expect(html).not.toContain('board-bind-asset-2');
    expect(html).not.toContain('still-uploading.jpg');

    const loading = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'loading', initialSelectedId: 'node-1' }),
    );
    expect(loading).toContain('board-assets-loading');

    const errored = render(
      React.createElement(BoardScreen, {
        initialDoc: doc,
        assetsState: 'error',
        assetsError: 'Assets are down.',
        initialSelectedId: 'node-1',
      }),
    );
    expect(errored).toContain('board-assets-error');
    expect(errored).toContain('Assets are down.');
  });
});

// ---------------------------------------------------------------------------
// Rendering — the slide-over panels (#50/#51/#52)
// ---------------------------------------------------------------------------

describe('Board panels rendering', () => {
  it('Ask Quanty: quick actions, and a preserved ask on the not-configured outcome', () => {
    const html = render(React.createElement(BoardAssistant, {}));
    for (const action of BOARD_ASSISTANT_ACTIONS) {
      expect(html).toContain(`board-assistant-action-${action.id}`);
    }
    const outcome = attemptBoardPlan('Chain my thali photo into a reel.');
    const withOutcome = render(React.createElement(BoardAssistant, { initialOutcome: outcome }));
    expect(withOutcome).toContain('board-assistant-outcome');
    expect(withOutcome).toContain('Chain my thali photo into a reel.');
    expect(withOutcome).toContain('PLANNER_NOT_CONFIGURED');
  });

  it('Team Chat renders its not-connected state — no invented conversation', () => {
    const html = render(React.createElement(BoardTeamChat, { boardTitle: 'Diwali chain' }));
    expect(html).toContain('board-teamchat-not-connected');
    expect(html).toContain('quantcooks.add_comment');
    expect(html).toContain('Diwali chain');
  });

  it('Share: a real link to copy, private access, invites honestly off', () => {
    const html = render(React.createElement(BoardShare, { boardId: 'board-3', boardTitle: 'Diwali chain' }));
    expect(html).toContain('board-access-private');
    expect(html).toContain('value="/studio/board/board-3"');
    expect(html).toContain('board-invite-off');
    expect(html).toContain('quantcooks.invite_collaborator');
    expect(html).toContain('board-member-owner');
  });

  it('the screen mounts each slide-over from its top-bar buttons’ state', () => {
    const doc = emptyBoardDoc('board-1');
    const assistant = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready', initialPanel: 'assistant' }),
    );
    expect(assistant).toContain('board-assistant');
    const chat = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready', initialPanel: 'chat' }),
    );
    expect(chat).toContain('board-teamchat');
    const share = render(
      React.createElement(BoardScreen, { initialDoc: doc, assetsState: 'ready', initialPanel: 'share' }),
    );
    expect(share).toContain('board-share');
  });
});
