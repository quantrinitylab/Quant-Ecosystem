import { createAppError } from '@quant/server-core';
import * as Y from 'yjs';
import { collabPersistence, type PersistenceAdapter } from './collab-persistence';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;
const OPEN = 1;

/** Compact after this many durable deltas, or after the debounce window idles. */
const DEFAULT_COMPACT_EVERY_UPDATES = 200;

export interface WebSocketLike {
  readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: any[]) => void): void;
  off?(event: string, listener: (...args: any[]) => void): void;
}

export interface AwarenessState {
  clientId: string;
  userId?: string;
  name?: string;
  color?: string;
  cursor?: unknown;
  selection?: unknown;
  [key: string]: unknown;
}

export interface DocRoom {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly connections: Set<WebSocketLike>;
  readonly awareness: Map<string, AwarenessState>;
  readonly awarenessClients: Map<WebSocketLike, Set<string>>;
  loaded: Promise<void>;
  lastActivity: number;
  /** Serialises durable appends so versions are allocated in submission order. */
  pendingWrite: Promise<void>;
  uncompacted: number;
}

export interface YjsServerOptions {
  docName?: string;
  persistence?: PersistenceAdapter;
  gc?: boolean;
  persistDebounceMs?: number;
  maxMessageBytes?: number;
  compactEveryUpdates?: number;
  checkAccess?: (docName: string, request: WebSocketRequestLike) => Promise<boolean> | boolean;
}

export interface WebSocketRequestLike {
  url?: string;
  params?: unknown;
}

const rooms = new Map<string, DocRoom>();
const persistenceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getLiveDoc(docName: string): Y.Doc | undefined {
  return rooms.get(docName)?.doc;
}

function frame(type: number, subtype: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const message = new Uint8Array(payload.byteLength + 2);
  message[0] = type;
  message[1] = subtype;
  message.set(payload, 2);
  return message;
}

function awarenessFrame(state: AwarenessState | { clientId: string; removed: true }): Uint8Array {
  return frame(MESSAGE_AWARENESS, SYNC_UPDATE, new TextEncoder().encode(JSON.stringify(state)));
}

function asUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'object' && data !== null && 'data' in data) {
    return asUint8Array((data as { data: unknown }).data);
  }
  throw createAppError('Unsupported collaboration frame', 400, 'INVALID_COLLAB_FRAME');
}

function resolveDocName(request: WebSocketRequestLike, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const fromParams = (request.params as { docId?: string } | undefined)?.docId;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();
  const rawUrl = request.url ?? '';
  const path = rawUrl.split('?')[0]?.replace(/\/+$/, '') ?? '';
  const docName = decodeURIComponent(path.split('/').pop() ?? '').trim();
  if (!docName || docName.length > 256) {
    throw createAppError(
      'A valid collaboration document id is required',
      400,
      'INVALID_DOCUMENT_ID',
    );
  }
  return docName;
}

function send(socket: WebSocketLike, message: Uint8Array): void {
  if (socket.readyState === OPEN) socket.send(message);
}

function broadcast(room: DocRoom, message: Uint8Array, except?: WebSocketLike): void {
  for (const socket of room.connections) {
    if (socket !== except) send(socket, message);
  }
}

function scheduleCompaction(room: DocRoom, persistence: PersistenceAdapter, delayMs: number): void {
  const previous = persistenceTimers.get(room.name);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    persistenceTimers.delete(room.name);
    room.pendingWrite = room.pendingWrite
      .then(async () => {
        await persistence.compact(room.name, room.doc);
        room.uncompacted = 0;
      })
      // Compaction is an optimisation, never a durability requirement: the deltas
      // are already committed, so a failure here must not drop them.
      .catch(() => {});
  }, delayMs);
  timer.unref();
  persistenceTimers.set(room.name, timer);
}

function failRoom(room: DocRoom, reason: string): void {
  // Evict immediately so no subsequent getRoom() gets this failed/corrupt room
  rooms.delete(room.name);

  const timer = persistenceTimers.get(room.name);
  if (timer) {
    clearTimeout(timer);
    persistenceTimers.delete(room.name);
  }

  for (const socket of room.connections) {
    try {
      socket.close(1011, reason);
    } catch {}
  }
  room.connections.clear();

  room.pendingWrite.finally(() => {
    try {
      room.doc.destroy();
    } catch {}
  });
}

/** Await every queued durable write for a room. Used on shutdown and in tests. */
export async function flushPendingWrites(docName: string): Promise<void> {
  const room = rooms.get(docName);
  if (!room) return;
  const timer = persistenceTimers.get(docName);
  if (timer) {
    clearTimeout(timer);
    persistenceTimers.delete(docName);
  }
  await room.pendingWrite;
}

async function createRoom(name: string, options: YjsServerOptions): Promise<DocRoom> {
  const persistence = options.persistence ?? collabPersistence;
  const doc = new Y.Doc({ gc: options.gc ?? true });
  const room: DocRoom = {
    name,
    doc,
    connections: new Set(),
    awareness: new Map(),
    awarenessClients: new Map(),
    loaded: Promise.resolve(),
    lastActivity: Date.now(),
    pendingWrite: Promise.resolve(),
    uncompacted: 0,
  };

  room.loaded = persistence.loadUpdate(name).then((update) => {
    if (update) Y.applyUpdate(doc, update, 'prisma-load');
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    // Replaying what we just loaded must never be re-appended as a new delta,
    // otherwise every room open duplicates the entire document into the log.
    if (origin === 'prisma-load') return;
    room.lastActivity = Date.now();
    const payload = update.slice();

    // Durable-before-ack: append first, broadcast second. Costs one DB round trip
    // of latency and buys the actual Gate G-A guarantee.
    room.pendingWrite = room.pendingWrite
      .then(async () => {
        if (typeof persistence.appendUpdate === 'function') {
          await persistence.appendUpdate(name, payload);
        }
      })
      .then(() => {
        room.uncompacted += 1;
        broadcast(
          room,
          frame(MESSAGE_SYNC, SYNC_UPDATE, payload),
          origin as WebSocketLike | undefined,
        );
        const threshold = options.compactEveryUpdates ?? DEFAULT_COMPACT_EVERY_UPDATES;
        if (room.uncompacted >= threshold) {
          room.uncompacted = 0;
          room.pendingWrite = room.pendingWrite
            .then(() =>
              typeof persistence.compact === 'function'
                ? persistence.compact(name, room.doc).then(() => undefined)
                : undefined,
            )
            .catch(() => {});
        } else {
          scheduleCompaction(room, persistence, options.persistDebounceMs ?? 1_000);
        }
      })
      .catch(() => {
        // The edit is NOT durable. Tell the clients instead of pretending it is.
        failRoom(room, 'Collaboration persistence unavailable');
      });
  });

  rooms.set(name, room);
  try {
    await room.loaded;
  } catch (error) {
    // Never leave a room cached with a rejected `loaded` promise: every later
    // getRoom() would await it and throw forever until the process restarts.
    rooms.delete(name);
    doc.destroy();
    throw error;
  }
  return room;
}

async function getRoom(name: string, options: YjsServerOptions): Promise<DocRoom> {
  const existing = rooms.get(name);
  if (existing) {
    await existing.loaded;
    return existing;
  }
  return createRoom(name, options);
}

async function handleMessage(
  room: DocRoom,
  socket: WebSocketLike,
  raw: unknown,
  options: YjsServerOptions,
): Promise<void> {
  const message = asUint8Array(raw);
  if (message.byteLength < 2 || message.byteLength > (options.maxMessageBytes ?? 2 * 1024 * 1024)) {
    throw createAppError('Invalid collaboration frame size', 400, 'INVALID_COLLAB_FRAME');
  }

  const type = message[0];
  const subtype = message[1];
  const payload = message.subarray(2);
  room.lastActivity = Date.now();

  if (type === MESSAGE_SYNC) {
    if (subtype === SYNC_STEP_1) {
      send(socket, frame(MESSAGE_SYNC, SYNC_STEP_2, Y.encodeStateAsUpdate(room.doc, payload)));
      return;
    }
    if (subtype === SYNC_STEP_2 || subtype === SYNC_UPDATE) {
      Y.applyUpdate(room.doc, payload, socket);
      return;
    }
  }

  if (type === MESSAGE_AWARENESS) {
    const state = JSON.parse(new TextDecoder().decode(payload)) as AwarenessState;
    if (!state.clientId || typeof state.clientId !== 'string') {
      throw createAppError('Awareness clientId is required', 400, 'INVALID_AWARENESS_STATE');
    }
    room.awareness.set(state.clientId, state);
    const clientIds = room.awarenessClients.get(socket) ?? new Set<string>();
    clientIds.add(state.clientId);
    room.awarenessClients.set(socket, clientIds);
    broadcast(room, awarenessFrame(state), socket);
    return;
  }

  throw createAppError('Unknown collaboration message type', 400, 'INVALID_COLLAB_FRAME');
}

export async function setupWSConnection(
  socket: WebSocketLike,
  request: WebSocketRequestLike,
  options: YjsServerOptions = {},
): Promise<DocRoom> {
  const name = resolveDocName(request, options.docName);
  if (options.checkAccess) {
    const allowed = await options.checkAccess(name, request);
    if (!allowed) {
      socket.close(4403, 'Forbidden: cross-tenant access prohibited');
      return {
        name,
        doc: new Y.Doc(),
        connections: new Set(),
        awareness: new Map(),
        awarenessClients: new Map(),
        loaded: Promise.resolve(),
        lastActivity: Date.now(),
        pendingWrite: Promise.resolve(),
        uncompacted: 0,
      };
    }
  }
  const room = await getRoom(name, options);
  room.connections.add(socket);
  room.lastActivity = Date.now();

  send(socket, frame(MESSAGE_SYNC, SYNC_STEP_1, Y.encodeStateVector(room.doc)));
  send(socket, frame(MESSAGE_SYNC, SYNC_STEP_2, Y.encodeStateAsUpdate(room.doc)));
  for (const state of room.awareness.values()) send(socket, awarenessFrame(state));

  const onMessage = (data: unknown) => {
    void handleMessage(room, socket, data, options).catch(() =>
      socket.close(1003, 'Invalid collaboration frame'),
    );
  };
  const onClose = () => {
    room.connections.delete(socket);
    const clientIds = room.awarenessClients.get(socket) ?? new Set<string>();
    room.awarenessClients.delete(socket);
    for (const clientId of clientIds) {
      room.awareness.delete(clientId);
      broadcast(room, awarenessFrame({ clientId, removed: true }));
    }
    if (room.connections.size === 0) {
      const persistence = options.persistence ?? collabPersistence;
      room.pendingWrite = room.pendingWrite
        .then(async () => {
          if (typeof persistence.compact === 'function') {
            await persistence.compact(name, room.doc);
          } else if (typeof (persistence as any).saveDoc === 'function') {
            await (persistence as any).saveDoc(name, room.doc);
          }
        })
        .catch(() => {});
    }
  };

  socket.on('message', onMessage);
  socket.on('close', onClose);
  socket.on('error', onClose);
  return room;
}

export async function getYDoc(docName: string, options: YjsServerOptions = {}): Promise<Y.Doc> {
  if (!docName.trim()) {
    throw createAppError(
      'A valid collaboration document id is required',
      400,
      'INVALID_DOCUMENT_ID',
    );
  }
  return (await getRoom(docName, options)).doc;
}

export async function closeYDoc(docName: string, options: YjsServerOptions = {}): Promise<void> {
  const room = rooms.get(docName);
  if (!room) return;
  const timer = persistenceTimers.get(docName);
  if (timer) {
    clearTimeout(timer);
    persistenceTimers.delete(docName);
  }
  await room.pendingWrite;
  const persistence = options.persistence ?? collabPersistence;
  if (typeof persistence.compact === 'function') {
    await persistence.compact(docName, room.doc);
  } else if (typeof (persistence as any).saveDoc === 'function') {
    await (persistence as any).saveDoc(docName, room.doc);
  }
  for (const socket of room.connections) socket.close(1001, 'Room closed');
  room.doc.destroy();
  rooms.delete(docName);
}

export const yjsServer = { setupWSConnection, getYDoc, closeYDoc, flushPendingWrites };
