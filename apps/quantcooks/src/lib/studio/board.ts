// ============================================================================
// QuantCooks Studio — Canvas Board data & flow logic (spec §6, G-12)
//
// Pure helpers behind the Canvas Board screens (Board home #47, the board
// screen #48, generator nodes #49 and the "Ask Quanty" assistant #52).
// The board is DATA: nodes and edges in one document, and every screen is
// a projection of that document. All graph rules live here so the UI, the
// tests and (per the tool-twin rule) a future QuantAI pipeline call agree.
//
// What is REAL today:
//  - The graph itself: node CRUD, edge rules (type compatibility, cycle
//    refusal — every refusal carries its reason), undo/redo history, and
//    the run PLAN: topological order, per-node quotes composed on
//    pricing.ts, and a total quote (quote-before-spend, spec §0.1 rule 5).
//  - Asset nodes bound to the caller's own READY assets (P0-3) by id.
//  - Saved pipelines: a board's definition stored in exactly the shape
//    quantcooks.run_pipeline takes inline ({ nodes, edges }).
// What is NOT real today, and never faked here:
//  - Execution. quantcooks.run_pipeline is registered in CP-1 (tool #51)
//    but the generation providers underneath it are Tier B fail-closed,
//    and quantcooks.plan_project (#54) has a fail-closed executor
//    (PLANNER_NOT_CONFIGURED). A run therefore produces a priced PLAN in
//    which every step lands NOT_CONFIGURED with its twin named — it
//    charges nothing and NEVER invents an output asset or a result node.
//  - Persistence of the board document. Boards are not server objects
//    yet: projects accept name/type only (Unit 5's verified finding) and
//    the P0-5 state endpoint stores exactly one document — the timeline
//    editor's. So boards live in the per-device draft mirror below and
//    the UI says so ("draft on this device"). Named follow-up: a
//    server-side board document (project board metadata), after which
//    boards also become the list_projects surface the checklist names.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import {
  computeQuote,
  modelRateFor,
  type ComposerSettings,
  type CreditQuote,
  type StudioGenerationKind,
} from './pricing';
import { parsePromptMentions } from './mentions';

/** The registered QuantAI tool twins of these screens (CP-1 manifest §3). */
export const BOARD_RUN_TOOL = 'quantcooks.run_pipeline';
export const BOARD_PLAN_TOOL = 'quantcooks.plan_project';
export const BOARD_IMAGE_TOOL = 'quantcooks.generate_dish_image';
export const BOARD_VIDEO_TOOL = 'quantcooks.generate_video_from_text';
export const BOARD_VOICE_TOOL = 'quantcooks.add_voiceover';
export const BOARD_AD_TOOL = 'quantcooks.create_food_ad';
/** Collaboration twins (CP-1) — the Team Chat panel's eventual wiring. */
export const BOARD_COMMENT_TOOL = 'quantcooks.add_comment';
export const BOARD_COLLABORATORS_TOOL = 'quantcooks.list_collaborators';
export const BOARD_INVITE_TOOL = 'quantcooks.invite_collaborator';

// ---------------------------------------------------------------------------
// Node types. The generator kinds follow spec §6.2's add menu (Prompt ·
// Image/Video/Voice Generator · Assistant · Upload · Reference · Asset ·
// Folder) plus an Ad Generator (the Promo chain's end node — its twin is
// create_food_ad) and the freeform objects the spec puts on the same
// board (sticky notes, text, comment pins) and an Output sink node.
// ---------------------------------------------------------------------------

export type BoardNodeType =
  | 'prompt'
  | 'image-generator'
  | 'video-generator'
  | 'voice-generator'
  | 'ad-generator'
  | 'assistant'
  | 'upload'
  | 'reference'
  | 'asset'
  | 'output'
  | 'folder'
  | 'sticky'
  | 'text'
  | 'comment';

export const GENERATOR_TYPES: BoardNodeType[] = [
  'image-generator',
  'video-generator',
  'voice-generator',
  'ad-generator',
];

export function isGeneratorType(type: BoardNodeType): boolean {
  return GENERATOR_TYPES.includes(type);
}

/** Generation kind (pricing.ts vocabulary) for a generator node type. */
export function generationKindFor(type: BoardNodeType): StudioGenerationKind | null {
  switch (type) {
    case 'image-generator':
      return 'image';
    case 'video-generator':
      return 'video';
    case 'voice-generator':
      return 'audio';
    case 'ad-generator':
      return 'ad';
    default:
      return null;
  }
}

/** The CP-1 twin that would execute one node of this type, if any. */
export function twinToolFor(type: BoardNodeType): string | null {
  switch (type) {
    case 'image-generator':
      return BOARD_IMAGE_TOOL;
    case 'video-generator':
      return BOARD_VIDEO_TOOL;
    case 'voice-generator':
      return BOARD_VOICE_TOOL;
    case 'ad-generator':
      return BOARD_AD_TOOL;
    case 'assistant':
      return BOARD_PLAN_TOOL;
    default:
      return null;
  }
}

export interface BoardNodeMeta {
  type: BoardNodeType;
  label: string;
  /** One line of plain language for the add menu. */
  description: string;
}

export const BOARD_NODE_TYPES: BoardNodeMeta[] = [
  { type: 'prompt', label: 'Prompt', description: 'Words that feed a generator — a dish brief, a script, a scene.' },
  { type: 'image-generator', label: 'Image Generator', description: 'Make a dish still from a prompt or a reference photo.' },
  { type: 'video-generator', label: 'Video Generator', description: 'Make or animate a clip from a prompt, a still or a clip.' },
  { type: 'voice-generator', label: 'Voice Generator', description: 'Turn a script into a voiceover track.' },
  { type: 'ad-generator', label: 'Ad Generator', description: 'Cut a short dish ad from a photo or a clip.' },
  { type: 'assistant', label: 'Assistant', description: 'A planning step — Quanty reads the board and drafts the next move.' },
  { type: 'upload', label: 'Upload', description: 'A slot for media the cook will add when the pipeline runs.' },
  { type: 'reference', label: 'Reference', description: 'A still that steers a generator — plating, light, backdrop.' },
  { type: 'asset', label: 'Asset', description: 'One of your saved photos or clips, wired in by name.' },
  { type: 'output', label: 'Output', description: 'Where a chain lands — the finished media collects here.' },
  { type: 'folder', label: 'Folder', description: 'Group nodes that belong together on the board.' },
  { type: 'sticky', label: 'Sticky Note', description: 'A note to self or the team, pinned to the board.' },
  { type: 'text', label: 'Text', description: 'A free text block — a title, a caption, a reminder.' },
  { type: 'comment', label: 'Comment', description: 'A pinned comment thread on a spot of the board.' },
];

export function nodeMeta(type: BoardNodeType): BoardNodeMeta {
  return BOARD_NODE_TYPES.find((m) => m.type === type) ?? BOARD_NODE_TYPES[0]!;
}

// ---------------------------------------------------------------------------
// The document model. Identity inside the document is always an id
// (node / asset), never a signed URL — URLs expire; the asset's fresh
// URL rides along only as a preview hint, exactly as in film.ts.
// ---------------------------------------------------------------------------

export type BoardMediaKind = 'image' | 'video' | 'audio' | 'file';

export interface BoardNode {
  id: string;
  type: BoardNodeType;
  title: string;
  x: number;
  y: number;
  /** Prompt / sticky / text / comment body; the assistant's instruction. */
  text: string;
  /** Asset, Reference and bound Upload nodes: the caller's asset id. */
  assetId: string | null;
  filename: string | null;
  /** Fresh signed URL for preview; a hint only, may be stale in a mirror. */
  url: string | null;
  mediaKind: BoardMediaKind | null;
  /** Generator nodes only: the node's own composer settings. */
  settings: ComposerSettings | null;
  /** Folder nodes only: the node ids grouped inside. */
  memberIds: string[];
  /** Sticky notes: the paper colour. */
  color: string | null;
  /** Comment nodes: thread resolved. */
  resolved: boolean;
}

export interface BoardEdge {
  id: string;
  from: string;
  to: string;
}

export interface BoardDoc {
  id: string;
  title: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
}

export const EMPTY_BOARD_TITLE = 'Untitled board';

/** On-board card footprint used for edge anchors and the minimap. */
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 120;

/** Default composer settings per generation kind (kind-correct model). */
export function defaultNodeSettings(kind: StudioGenerationKind): ComposerSettings {
  const rate = modelRateFor(kind, '');
  return {
    modelId: rate.id,
    ratio: kind === 'image' ? '4:5' : '9:16',
    resolution: kind === 'image' ? 'Standard' : '720p',
    durationSeconds: kind === 'image' ? 0 : kind === 'audio' ? 30 : 5,
    batch: 1,
    audioOn: kind === 'video' || kind === 'ad',
    stackedExtras: 0,
  };
}

export function emptyNode(id: string, type: BoardNodeType, x: number, y: number): BoardNode {
  const kind = generationKindFor(type);
  return {
    id,
    type,
    title: nodeMeta(type).label,
    x,
    y,
    text: '',
    assetId: null,
    filename: null,
    url: null,
    mediaKind: null,
    settings: kind ? defaultNodeSettings(kind) : null,
    memberIds: [],
    color: type === 'sticky' ? 'Butter' : null,
    resolved: false,
  };
}

/** Next deterministic node id (node-1, node-2, …) — stable across saves. */
export function nextNodeId(nodes: BoardNode[]): string {
  let max = 0;
  for (const node of nodes) {
    const match = /^node-(\d+)$/.exec(node.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `node-${max + 1}`;
}

export function nextEdgeId(edges: BoardEdge[]): string {
  let max = 0;
  for (const edge of edges) {
    const match = /^edge-(\d+)$/.exec(edge.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `edge-${max + 1}`;
}

export function nodeById(doc: BoardDoc, id: string): BoardNode | null {
  return doc.nodes.find((n) => n.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Node CRUD — pure operations on the document.
// ---------------------------------------------------------------------------

/** Add a node at a cascaded free-ish position (the UI may drag it after). */
export function addNode(doc: BoardDoc, type: BoardNodeType): BoardDoc {
  const id = nextNodeId(doc.nodes);
  const offset = (doc.nodes.length % 6) * 28;
  const node = emptyNode(id, type, 48 + offset, 48 + offset);
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function updateNode(doc: BoardDoc, id: string, patch: Partial<BoardNode>): BoardDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function moveNodeBy(doc: BoardDoc, id: string, dx: number, dy: number): BoardDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === id ? { ...n, x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) } : n,
    ),
  };
}

/** Removing a node also removes its edges and its folder memberships. */
export function removeNode(doc: BoardDoc, id: string): BoardDoc {
  return {
    ...doc,
    nodes: doc.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        n.type === 'folder' && n.memberIds.includes(id)
          ? { ...n, memberIds: n.memberIds.filter((m) => m !== id) }
          : n,
      ),
    edges: doc.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

/** Arrange: lay the nodes out in one row, in run (topological) order. */
export function arrangeBoard(doc: BoardDoc): BoardDoc {
  const order = topologicalOrder(doc);
  const positions = new Map(order.map((id, index) => [id, { x: 40 + index * (NODE_WIDTH + 60), y: 80 }]));
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const pos = positions.get(n.id);
      return pos ? { ...n, ...pos } : n;
    }),
  };
}

export function renameBoard(doc: BoardDoc, title: string): BoardDoc {
  const trimmed = title.trim();
  return { ...doc, title: trimmed === '' ? EMPTY_BOARD_TITLE : trimmed };
}

// ---------------------------------------------------------------------------
// Asset binding — only bytes that actually landed may wire into a board:
// READY assets only (P0-3), the same rule every studio picker follows.
// ---------------------------------------------------------------------------

export function pickableBoardAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.uploadStatus === 'READY');
}

export function mediaKindOf(asset: ServerAsset): BoardMediaKind {
  if (asset.type === 'image' || asset.type === 'video' || asset.type === 'audio') {
    return asset.type;
  }
  return 'file';
}

/** Bind a real asset into an Asset / Reference / Upload node's payload. */
export function bindAssetToNode(doc: BoardDoc, nodeId: string, asset: ServerAsset): BoardDoc {
  if (asset.uploadStatus !== 'READY') return doc;
  return updateNode(doc, nodeId, {
    assetId: asset.id,
    filename: asset.filename,
    url: asset.url,
    mediaKind: mediaKindOf(asset),
    title: asset.filename,
  });
}

// ---------------------------------------------------------------------------
// Edge rules. Which type may feed which is a table, not a vibe:
//  - Producers: prompt, asset, upload, reference, the four generators and
//    the assistant. Output is a sink; folder/sticky/text/comment are
//    board furniture and never carry a signal.
//  - Consumers: the four generators, the assistant and output. Sources
//    and furniture accept no inbound wire.
//  - Media fit is checked per consumer: an Image Generator takes stills,
//    a Voice Generator takes words (a Prompt), and so on. Every refusal
//    returns its reason — a wire is never silently dropped.
// ---------------------------------------------------------------------------

const PRODUCER_TYPES: BoardNodeType[] = [
  'prompt',
  'asset',
  'upload',
  'reference',
  'image-generator',
  'video-generator',
  'voice-generator',
  'ad-generator',
  'assistant',
];

const CONSUMER_TYPES: BoardNodeType[] = [
  'image-generator',
  'video-generator',
  'voice-generator',
  'ad-generator',
  'assistant',
  'output',
];

export type ConnectResult = { ok: true } | { ok: false; reason: string };

function mediaOf(node: BoardNode): BoardMediaKind | null {
  if (node.type === 'asset' || node.type === 'reference' || node.type === 'upload') {
    return node.mediaKind;
  }
  if (node.type === 'image-generator') return 'image';
  if (node.type === 'video-generator' || node.type === 'ad-generator') return 'video';
  if (node.type === 'voice-generator') return 'audio';
  return null;
}

function mediaFitReason(from: BoardNode, to: BoardNode): string | null {
  const media = mediaOf(from);
  // An unbound slot (Upload / Asset / Reference with nothing bound yet)
  // carries unknown media — the wire is structural and fit is decided
  // when the cook binds a real asset, never refused in advance.
  if (media === null && (from.type === 'upload' || from.type === 'asset' || from.type === 'reference')) {
    return null;
  }
  switch (to.type) {
    case 'image-generator':
      if (from.type === 'prompt' || from.type === 'assistant') return null;
      if (media === 'image') return null;
      return `${nodeMeta(to.type).label} works from a still — ${from.title} carries ${media ?? 'no media'}, so the wire does not fit.`;
    case 'video-generator':
      if (from.type === 'prompt' || from.type === 'assistant') return null;
      if (media === 'image' || media === 'video') return null;
      return `${nodeMeta(to.type).label} works from a still or a clip — ${from.title} carries ${media ?? 'no media'}, so the wire does not fit.`;
    case 'voice-generator':
      if (from.type === 'prompt' || from.type === 'assistant') return null;
      return `${nodeMeta(to.type).label} takes words — wire a Prompt with the script, not media. The video it should ride on wires into the Output beside it.`;
    case 'ad-generator':
      if (from.type === 'prompt' || from.type === 'assistant') return null;
      if (media === 'image' || media === 'video') return null;
      return `${nodeMeta(to.type).label} cuts from a photo or a clip — ${from.title} carries ${media ?? 'no media'}, so the wire does not fit.`;
    case 'assistant':
      if (from.type === 'prompt') return null;
      return `The Assistant reads words — wire a Prompt into it; media feeds a generator directly.`;
    case 'output':
      if (from.type === 'prompt') {
        return 'Output collects finished media, not words — wire a generator between the Prompt and the Output.';
      }
      if (from.type === 'assistant') {
        return 'The Assistant drafts plans, not media — its output guides a generator, it does not land in Output.';
      }
      return null;
    default:
      return null;
  }
}

/** Would adding from→to close a cycle? (Reachability over existing edges.) */
export function createsCycle(edges: BoardEdge[], from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.from === current) stack.push(edge.to);
    }
  }
  return false;
}

export function canConnect(doc: BoardDoc, fromId: string, toId: string): ConnectResult {
  const from = nodeById(doc, fromId);
  const to = nodeById(doc, toId);
  if (!from || !to) return { ok: false, reason: 'One end of that wire is no longer on the board.' };
  if (fromId === toId) return { ok: false, reason: 'A node cannot wire into itself.' };
  if (doc.edges.some((e) => e.from === fromId && e.to === toId)) {
    return { ok: false, reason: `${from.title} already feeds ${to.title} — one wire between a pair is enough.` };
  }
  if (!PRODUCER_TYPES.includes(from.type)) {
    return {
      ok: false,
      reason:
        from.type === 'output'
          ? 'Output is where a chain lands — nothing wires out of it.'
          : `${nodeMeta(from.type).label} is board furniture — it annotates the board but carries no signal to feed onward.`,
    };
  }
  if (!CONSUMER_TYPES.includes(to.type)) {
    return {
      ok: false,
      reason: `${nodeMeta(to.type).label} takes no input wire — it is a source or an annotation, not a step.`,
    };
  }
  const fit = mediaFitReason(from, to);
  if (fit) return { ok: false, reason: fit };
  if (createsCycle(doc.edges, fromId, toId)) {
    return { ok: false, reason: 'That wire would close a loop — a pipeline runs forward, each step feeding the next.' };
  }
  return { ok: true };
}

export type ConnectOutcome =
  | { status: 'connected'; doc: BoardDoc; edge: BoardEdge }
  | { status: 'refused'; reason: string };

export function connectNodes(doc: BoardDoc, fromId: string, toId: string): ConnectOutcome {
  const check = canConnect(doc, fromId, toId);
  if (!check.ok) return { status: 'refused', reason: check.reason };
  const edge: BoardEdge = { id: nextEdgeId(doc.edges), from: fromId, to: toId };
  return { status: 'connected', doc: { ...doc, edges: [...doc.edges, edge] }, edge };
}

export function disconnectEdge(doc: BoardDoc, edgeId: string): BoardDoc {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== edgeId) };
}

/** Human label for what a wire binds: the input a source gives a step. */
export function edgeBindingLabel(doc: BoardDoc, edge: BoardEdge): string {
  const from = nodeById(doc, edge.from);
  const to = nodeById(doc, edge.to);
  if (!from || !to) return 'wire';
  if (from.type === 'prompt') return `${from.title} → words for ${to.title}`;
  if (from.type === 'assistant') return `${from.title} → plan for ${to.title}`;
  return `${from.title} → input for ${to.title}`;
}

// ---------------------------------------------------------------------------
// Quotes — a generator node prices through pricing.ts's own composition,
// exactly as its studio prices: nodeQuote IS computeQuote for the node's
// kind and settings, never a parallel table.
// ---------------------------------------------------------------------------

export function nodeQuote(node: BoardNode): CreditQuote | null {
  const kind = generationKindFor(node.type);
  if (!kind || !node.settings) return null;
  return computeQuote(kind, node.settings);
}

// ---------------------------------------------------------------------------
// The run — a priced plan in topological order. Execution itself is
// run_pipeline's job (CP-1 #51) and its providers are not configured, so
// every executable step lands NOT_CONFIGURED naming its twin, the plan
// charges 0, and no output is ever produced or pretended. A step whose
// prompt is missing is BLOCKED — a separate, fixable reason, kept apart
// from the provider reason exactly as the storyboard gate keeps its two.
// ---------------------------------------------------------------------------

/** Topological order of node ids (Kahn); the doc is acyclic by rule. */
export function topologicalOrder(doc: BoardDoc): string[] {
  const indegree = new Map<string, number>();
  for (const node of doc.nodes) indegree.set(node.id, 0);
  for (const edge of doc.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const queue = doc.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const edge of doc.edges) {
      if (edge.from !== current) continue;
      const next = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    }
  }
  return order;
}

/** The prompt a generator step will use: its own text, else a wired Prompt's. */
export function effectivePrompt(doc: BoardDoc, node: BoardNode): string {
  if (node.text.trim() !== '') return node.text;
  for (const edge of doc.edges) {
    if (edge.to !== node.id) continue;
    const source = nodeById(doc, edge.from);
    if (source?.type === 'prompt' && source.text.trim() !== '') return source.text;
  }
  return '';
}

/** Labels of everything wired into a node (its bound inputs). */
export function inputLabels(doc: BoardDoc, node: BoardNode): string[] {
  return doc.edges
    .filter((e) => e.to === node.id)
    .map((e) => nodeById(doc, e.from)?.title ?? 'a removed node');
}

export interface BoardRunStep {
  nodeId: string;
  title: string;
  type: BoardNodeType;
  twin: string;
  /** not-configured = would run, provider missing · blocked = fixable gap. */
  outcome: 'not-configured' | 'blocked';
  reason: string;
  /** The step's quote in credits; blocked steps are excluded from totals. */
  quoteCredits: number;
  inputs: string[];
}

export interface BoardRunPlan {
  steps: BoardRunStep[];
  totalCredits: number;
  lines: string[];
  /** Always 0 today: a plan is produced, nothing is executed or charged. */
  chargedCredits: 0;
  tool: string;
}

export function planBoardRun(doc: BoardDoc, providerConfigured: boolean): BoardRunPlan {
  const steps: BoardRunStep[] = [];
  const lines: string[] = [];
  let totalCredits = 0;

  for (const nodeId of topologicalOrder(doc)) {
    const node = nodeById(doc, nodeId);
    if (!node) continue;
    const twin = twinToolFor(node.type);
    if (!twin) continue; // sources, furniture and the sink are not steps
    const inputs = inputLabels(doc, node);

    if (node.type === 'assistant') {
      steps.push({
        nodeId: node.id,
        title: node.title,
        type: node.type,
        twin,
        outcome: 'not-configured',
        reason:
          `Planning runs through ${BOARD_PLAN_TOOL}, whose planner is not configured yet ` +
          '(PLANNER_NOT_CONFIGURED). Planning is never charged.',
        quoteCredits: 0,
        inputs,
      });
      lines.push(`${node.title} — plan step · ${twin} · not configured · 0 credits`);
      continue;
    }

    const quote = nodeQuote(node);
    const prompt = effectivePrompt(doc, node);
    if (prompt.trim() === '') {
      steps.push({
        nodeId: node.id,
        title: node.title,
        type: node.type,
        twin,
        outcome: 'blocked',
        reason: `${node.title} has no words yet — write its prompt, or wire a Prompt node into it, and it joins the run.`,
        quoteCredits: 0,
        inputs,
      });
      lines.push(`${node.title} — blocked · no prompt yet · excluded from the total`);
      continue;
    }

    const credits = quote?.credits ?? 0;
    totalCredits += credits;
    steps.push({
      nodeId: node.id,
      title: node.title,
      type: node.type,
      twin,
      outcome: 'not-configured',
      reason: providerConfigured
        ? `${twin} would run this step — this build produces the plan only.`
        : `${twin}'s provider is not configured yet (NOT_CONFIGURED), so this step cannot execute. Nothing will be charged.`,
      quoteCredits: credits,
      inputs,
    });
    lines.push(`${node.title} — ${credits} credits · ${twin}`);
  }

  return { steps, totalCredits, lines, chargedCredits: 0, tool: BOARD_RUN_TOOL };
}

// ---------------------------------------------------------------------------
// The "Ask Quanty" assistant (spec §6.4) — the board's face of
// plan_project (CP-6). The ask is preserved verbatim; the outcome type
// provably carries NO nodes, so the panel can never pretend Quanty built
// a graph. Quick actions are the spec's four, in our words.
// ---------------------------------------------------------------------------

export const BOARD_ASSISTANT_ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'create-pipeline', label: 'Create a pipeline' },
  { id: 'ideas-to-nodes', label: 'Turn ideas into nodes' },
  { id: 'from-reference', label: 'Build from a reference' },
  { id: 'prompt-to-nodes', label: 'Turn this prompt into nodes' },
];

export type AssistantOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'not-configured'; tool: string; ask: string; message: string };

export function attemptBoardPlan(ask: string): AssistantOutcome {
  const trimmed = ask.trim();
  if (trimmed === '') {
    return {
      status: 'invalid',
      message: 'Describe the pipeline first — what goes in, what should come out — and Quanty will plan from that.',
    };
  }
  return {
    status: 'not-configured',
    tool: BOARD_PLAN_TOOL,
    ask: trimmed,
    message:
      `Your words are kept below, exactly as written. Turning them into nodes runs through ` +
      `${BOARD_PLAN_TOOL}, whose planner is not configured yet (PLANNER_NOT_CONFIGURED) — so no nodes ` +
      'were added and nothing was charged. Until Quanty connects, the same pipeline can be built by ' +
      'hand: every node you add prices itself the way the plan would.',
  };
}

/** @-mentions and / references inside a node's text parse with the shared grammar. */
export function nodeTextMentions(node: BoardNode) {
  return parsePromptMentions(node.text);
}

// ---------------------------------------------------------------------------
// Undo / redo — an immutable history over the document.
// ---------------------------------------------------------------------------

export interface BoardHistory {
  past: BoardDoc[];
  present: BoardDoc;
  future: BoardDoc[];
}

export function historyOf(doc: BoardDoc): BoardHistory {
  return { past: [], present: doc, future: [] };
}

export function historyPush(history: BoardHistory, doc: BoardDoc): BoardHistory {
  if (doc === history.present) return history;
  return { past: [...history.past, history.present], present: doc, future: [] };
}

export function historyUndo(history: BoardHistory): BoardHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function historyRedo(history: BoardHistory): BoardHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Starters (checklist #47's Explore templates) — data only. Instantiating
// one copies its nodes/edges into a fresh board with fresh ids; the media
// slots arrive UNBOUND (an Upload/Asset slot never borrows the caller's
// assets silently — the cook binds their own photo).
// ---------------------------------------------------------------------------

export interface BoardStarter {
  id: string;
  name: string;
  description: string;
  nodes: Array<{ key: string; type: BoardNodeType; title: string; text: string; x: number; y: number }>;
  edges: Array<{ from: string; to: string }>;
}

export const BOARD_STARTERS: BoardStarter[] = [
  {
    id: 'recipe-reel-pipeline',
    name: 'Recipe Reel Pipeline',
    description: 'A dish photo becomes a styled hero still, then a short animated reel for the feed.',
    nodes: [
      { key: 'photo', type: 'upload', title: 'Dish photo', text: '', x: 40, y: 80 },
      { key: 'still', type: 'image-generator', title: 'Hero still', text: 'Restyle this dish as a bright editorial menu photo.', x: 340, y: 80 },
      { key: 'reel', type: 'video-generator', title: 'Reel clip', text: 'Animate the still — steam rises, a slow push-in on the plate.', x: 640, y: 80 },
      { key: 'out', type: 'output', title: 'Finished reel', text: '', x: 940, y: 80 },
    ],
    edges: [
      { from: 'photo', to: 'still' },
      { from: 'still', to: 'reel' },
      { from: 'reel', to: 'out' },
    ],
  },
  {
    id: 'menu-ad-chain',
    name: 'Menu Ad Chain',
    description: 'One product photo, restyled, then cut into a short ad with the dish as the hero.',
    nodes: [
      { key: 'photo', type: 'upload', title: 'Product photo', text: '', x: 40, y: 80 },
      { key: 'still', type: 'image-generator', title: 'Ad still', text: 'Clean packshot of the dish on a bold backdrop, room for a headline.', x: 340, y: 80 },
      { key: 'ad', type: 'ad-generator', title: 'Dish ad', text: 'Cut a punchy short ad from the still — hook in the first second.', x: 640, y: 80 },
      { key: 'out', type: 'output', title: 'Finished ad', text: '', x: 940, y: 80 },
    ],
    edges: [
      { from: 'photo', to: 'ad' },
      { from: 'still', to: 'ad' },
      { from: 'ad', to: 'out' },
    ],
  },
  {
    id: 'dub-a-reel',
    name: 'Dub-a-Reel',
    description: 'A finished reel plus a translated script — the voiceover is generated to ride the clip.',
    nodes: [
      { key: 'clip', type: 'upload', title: 'Finished reel', text: '', x: 40, y: 200 },
      { key: 'script', type: 'prompt', title: 'Dub script', text: 'Write the new-language script here…', x: 40, y: 40 },
      { key: 'voice', type: 'voice-generator', title: 'Dub voiceover', text: '', x: 380, y: 120 },
      { key: 'out', type: 'output', title: 'Dubbed reel', text: '', x: 720, y: 120 },
    ],
    edges: [
      { from: 'script', to: 'voice' },
      { from: 'clip', to: 'out' },
      { from: 'voice', to: 'out' },
    ],
  },
];

export function starterById(id: string | null | undefined): BoardStarter | null {
  if (!id) return null;
  return BOARD_STARTERS.find((s) => s.id === id) ?? null;
}

/** Instantiate a starter into a fresh, editable board document. */
export function instantiateStarter(boardId: string, starter: BoardStarter): BoardDoc {
  const ids = new Map<string, string>();
  const nodes: BoardNode[] = starter.nodes.map((spec, index) => {
    const id = `node-${index + 1}`;
    ids.set(spec.key, id);
    const node = emptyNode(id, spec.type, spec.x, spec.y);
    return { ...node, title: spec.title, text: spec.text };
  });
  const edges: BoardEdge[] = starter.edges.map((spec, index) => ({
    id: `edge-${index + 1}`,
    from: ids.get(spec.from) ?? spec.from,
    to: ids.get(spec.to) ?? spec.to,
  }));
  return { id: boardId, title: starter.name, nodes, edges };
}

// ---------------------------------------------------------------------------
// Saved pipelines — a board definition stored in run_pipeline's own
// inline shape (CP-1 #51: { definition: { nodes, edges }, inputs }), so
// what the cook saves here is what QuantAI would run there.
// ---------------------------------------------------------------------------

export interface SavedPipeline {
  id: string;
  name: string;
  definition: { nodes: BoardNode[]; edges: BoardEdge[] };
  savedAt: string;
}

export function pipelineFromBoard(doc: BoardDoc, id: string, savedAt: string): SavedPipeline {
  return {
    id,
    name: doc.title,
    definition: { nodes: doc.nodes, edges: doc.edges },
    savedAt,
  };
}

// ---------------------------------------------------------------------------
// The draft mirror. Boards + pipelines + the board index live in
// localStorage on this device (see the header note for why), behind a
// tiny storage interface so the round-trip is testable without a DOM.
// Identity inside the mirror is always an id, never a URL.
// ---------------------------------------------------------------------------

export interface BoardStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const BOARD_INDEX_KEY = 'quantcooks.board.index.v1';
export const BOARD_DOC_KEY_PREFIX = 'quantcooks.board.doc.v1.';
export const BOARD_PIPELINES_KEY = 'quantcooks.board.pipelines.v1';

export function boardDocKey(boardId: string): string {
  return `${BOARD_DOC_KEY_PREFIX}${boardId}`;
}

export interface BoardMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export function nextBoardId(metas: BoardMeta[]): string {
  let max = 0;
  for (const meta of metas) {
    const match = /^board-(\d+)$/.exec(meta.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `board-${max + 1}`;
}

export function emptyBoardDoc(id: string): BoardDoc {
  return { id, title: EMPTY_BOARD_TITLE, nodes: [], edges: [] };
}

function parseMeta(raw: unknown): BoardMeta | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id === '' || typeof m.title !== 'string') return null;
  return { id: m.id, title: m.title, updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : '' };
}

export function loadBoardIndex(storage: BoardStorageLike): BoardMeta[] {
  try {
    const raw = storage.getItem(BOARD_INDEX_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(parseMeta).filter((m): m is BoardMeta => m !== null);
  } catch {
    return [];
  }
}

export function saveBoardIndex(storage: BoardStorageLike, metas: BoardMeta[]): void {
  storage.setItem(BOARD_INDEX_KEY, JSON.stringify(metas));
}

const NODE_TYPE_SET = new Set<string>(BOARD_NODE_TYPES.map((m) => m.type));

function parseNode(raw: unknown): BoardNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== 'string' || n.id === '') return null;
  if (typeof n.type !== 'string' || !NODE_TYPE_SET.has(n.type)) return null;
  const type = n.type as BoardNodeType;
  const kind = generationKindFor(type);
  const base = emptyNode(n.id, type, 0, 0);
  const settings =
    kind && typeof n.settings === 'object' && n.settings !== null
      ? { ...defaultNodeSettings(kind), ...(n.settings as Partial<ComposerSettings>) }
      : base.settings;
  return {
    ...base,
    title: typeof n.title === 'string' && n.title !== '' ? n.title : base.title,
    x: typeof n.x === 'number' ? n.x : 0,
    y: typeof n.y === 'number' ? n.y : 0,
    text: typeof n.text === 'string' ? n.text : '',
    assetId: typeof n.assetId === 'string' ? n.assetId : null,
    filename: typeof n.filename === 'string' ? n.filename : null,
    url: typeof n.url === 'string' ? n.url : null,
    mediaKind:
      n.mediaKind === 'image' || n.mediaKind === 'video' || n.mediaKind === 'audio' || n.mediaKind === 'file'
        ? n.mediaKind
        : null,
    settings,
    memberIds: Array.isArray(n.memberIds)
      ? n.memberIds.filter((m): m is string => typeof m === 'string')
      : [],
    color: typeof n.color === 'string' ? n.color : base.color,
    resolved: n.resolved === true,
  };
}

function parseEdge(raw: unknown, nodeIds: Set<string>): BoardEdge | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.from !== 'string' || typeof e.to !== 'string') return null;
  if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return null;
  return { id: e.id, from: e.from, to: e.to };
}

/**
 * Parse a mirrored board document. Anything malformed is dropped piece
 * by piece rather than trusted — a stale mirror must never crash the
 * board or resurrect a node type that no longer exists.
 */
export function parseBoardDoc(raw: string | null | undefined, fallbackId: string): BoardDoc | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.map(parseNode).filter((n): n is BoardNode => n !== null)
    : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Array.isArray(record.edges)
    ? record.edges.map((e) => parseEdge(e, nodeIds)).filter((e): e is BoardEdge => e !== null)
    : [];
  return {
    id: typeof record.id === 'string' && record.id !== '' ? record.id : fallbackId,
    title: typeof record.title === 'string' && record.title !== '' ? record.title : EMPTY_BOARD_TITLE,
    nodes,
    edges,
  };
}

export function loadBoardDoc(storage: BoardStorageLike, boardId: string): BoardDoc | null {
  return parseBoardDoc(storage.getItem(boardDocKey(boardId)), boardId);
}

export function saveBoardDoc(storage: BoardStorageLike, doc: BoardDoc, updatedAt: string): void {
  storage.setItem(boardDocKey(doc.id), JSON.stringify(doc));
  const metas = loadBoardIndex(storage);
  const rest = metas.filter((m) => m.id !== doc.id);
  saveBoardIndex(storage, [{ id: doc.id, title: doc.title, updatedAt }, ...rest]);
}

export function deleteBoard(storage: BoardStorageLike, boardId: string): void {
  storage.removeItem(boardDocKey(boardId));
  saveBoardIndex(storage, loadBoardIndex(storage).filter((m) => m.id !== boardId));
}

export function loadPipelines(storage: BoardStorageLike): SavedPipeline[] {
  try {
    const raw = storage.getItem(BOARD_PIPELINES_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const pipelines: SavedPipeline[] = [];
    for (const item of data) {
      if (typeof item !== 'object' || item === null) continue;
      const p = item as Record<string, unknown>;
      if (typeof p.id !== 'string' || typeof p.name !== 'string') continue;
      const def = (typeof p.definition === 'object' && p.definition !== null ? p.definition : {}) as Record<string, unknown>;
      const nodes = Array.isArray(def.nodes)
        ? def.nodes.map(parseNode).filter((n): n is BoardNode => n !== null)
        : [];
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edges = Array.isArray(def.edges)
        ? def.edges.map((e) => parseEdge(e, nodeIds)).filter((e): e is BoardEdge => e !== null)
        : [];
      pipelines.push({
        id: p.id,
        name: p.name,
        definition: { nodes, edges },
        savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
      });
    }
    return pipelines;
  } catch {
    return [];
  }
}

export function savePipeline(storage: BoardStorageLike, pipeline: SavedPipeline): SavedPipeline[] {
  const next = [pipeline, ...loadPipelines(storage).filter((p) => p.id !== pipeline.id)];
  storage.setItem(BOARD_PIPELINES_KEY, JSON.stringify(next));
  return next;
}

export function nextPipelineId(pipelines: SavedPipeline[]): string {
  return `pipeline-${pipelines.length + 1}-${Date.now().toString(36)}`;
}
