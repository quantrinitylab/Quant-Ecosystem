// ============================================================================
// QuantDrive Document Editor — Yjs CRDT & Collaboration Hook
// Adheres strictly to Gates N-G3, N-G4, and N-G5 in PHASE_N_COLLABORATION_MEMO.md
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as Y from 'yjs';
import { browserAuthSession } from '../../../../../services/browser-auth-session';
import { browserApiRequest } from '../../../../../services/browser-api-request';
import {
  docCacheAccountKey,
  purgeLegacyDocCacheKeys,
  readDocCache,
  writeDocCache,
  windowDocCacheStorage,
} from '../../../../../lib/docContentCache';
import type {
  EditorBlock,
  DocumentCollaborator,
  SyncStatus,
  DocumentMetadata,
  DocumentData,
  DocumentBreadcrumb,
  DocumentSubpage,
} from './types';
import { blocksToMarkdown, markdownToBlocks } from './markdown-serializer';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

function frame(type: number, subtype: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const result = new Uint8Array(payload.byteLength + 2);
  result[0] = type;
  result[1] = subtype;
  result.set(payload, 2);
  return result;
}

function awarenessFrame(state: Record<string, unknown>): Uint8Array {
  return frame(MESSAGE_AWARENESS, SYNC_UPDATE, new TextEncoder().encode(JSON.stringify(state)));
}

// ============================================================================
// Collab WebSocket handshake auth — SECURITY
// The session access token must NEVER be placed in the WebSocket URL query
// string: query params land in reverse-proxy/server access logs and in browser
// history. Browsers cannot set an `Authorization` header on a WebSocket upgrade
// request, so the bearer token travels as a `Sec-WebSocket-Protocol` offer
// (`bearer.<jwt>`) instead; the backend reads it from the offered protocol
// list and never echoes it back in the 101 response.
// ============================================================================
export const COLLAB_WS_SUBPROTOCOL = 'collab-v1';
const COLLAB_WS_BEARER_PREFIX = 'bearer.';

export function buildCollabWsHandshake(opts: {
  docId: string;
  wsHost: string;
  secure: boolean;
  token: string | null;
}): { url: string; protocols: string[] } {
  const protocol = opts.secure ? 'wss:' : 'ws:';
  const url = `${protocol}//${opts.wsHost}/collab/${encodeURIComponent(opts.docId)}`;
  const protocols = [COLLAB_WS_SUBPROTOCOL];
  const token = opts.token?.trim();
  if (token) {
    // JWTs are base64url segments joined by '.' — all valid
    // Sec-WebSocket-Protocol token characters (RFC 7230 tchar).
    protocols.push(`${COLLAB_WS_BEARER_PREFIX}${token}`);
  }
  return { url, protocols };
}

function generateCollaboratorColor(): string {
  const colors = [
    'var(--quant-primary)', // Quant Orange
    '#58A6FF', // Blue
    '#3FB950', // Green
    '#BC8CFF', // Purple
    '#D29922', // Amber
    '#F778BA', // Pink
    '#2EA043', // Deep Green
    '#79C0FF', // Cyan
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

const DEFAULT_BLOCKS: EditorBlock[] = [
  {
    id: 'b_title',
    type: 'h1',
    content: 'Untitled Document',
  },
  {
    id: 'b_body',
    type: 'paragraph',
    content: '',
  },
];

// ============================================================================
// Auto-save outcome contract — HONEST SAVE STATUS
// The auto-save effect must NEVER report 'saved' unless the backend actually
// accepted the write. A rejected write (401/403/400/500 on PATCH, or a failed
// POST create-fallback) is an 'error' so the UI can warn the user that their
// edits exist only in localStorage. A transport failure (fetch threw) is
// 'offline'. Split out as a pure exported function so it is unit-testable.
// ============================================================================
export type DocSaveOutcome = 'saved' | 'error' | 'offline';

export interface DocSavePayload {
  title: string;
  content: string;
  metadata: DocumentMetadata & { blocks: EditorBlock[] };
  isPublic: boolean;
}

export async function performDocSave(
  request: (
    url: string,
    init?: { method: string; body?: string },
  ) => Promise<{ ok: boolean; status: number }>,
  docId: string,
  payload: DocSavePayload,
  // P1 qm-drive-doc-cache-scope corrective (CODEX): every save carries the
  // account the content was loaded for. An empty/unresolved binding refuses
  // the write outright — no REST save is ever attempted without a known
  // account, and the hook additionally verifies the binding matches the
  // current account before calling.
  savedForAccount: string,
): Promise<DocSaveOutcome> {
  if (!savedForAccount) return 'error';
  try {
    const res = await request(`/api/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (res.ok) return 'saved';

    // PATCH 404: the document was never created in the DB — try POST create.
    // 'saved' ONLY if the create actually succeeds.
    if (res.status === 404) {
      const postRes = await request('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ id: docId, ...payload }),
      });
      return postRes.ok ? 'saved' : 'error';
    }

    // Any other rejected write (401/403/400/500/...): do NOT claim 'saved'.
    return 'error';
  } catch {
    return 'offline';
  }
}

// ============================================================================
// WebSocket-drop honesty contract — NEVER claim 'saved' when the live CRDT
// socket dies.
// P1 [drive] qm-collabdoc-ws-false-saved: ws.onclose, ws.onerror, and the
// connectWebSocket throw path all claimed 'saved' unconditionally at the
// exact moment live-sync stopped — while the last REST snapshot outcome was
// unknown — and could overwrite an honest 'error' from the auto-save. A
// socket drop only means the CRDT socket is gone, so it resolves to
// 'offline', EXCEPT an honest 'error' from the REST save path, which must be
// preserved ('error' stays 'error'). Pure and exported so it is unit-testable;
// use it via setSyncStatus(resolveSocketDropStatus) at the drop points below.
// ============================================================================
export function resolveSocketDropStatus(current: SyncStatus): SyncStatus {
  return current === 'error' ? 'error' : 'offline';
}

// P1 qm-drive-doc-cache-scope: the hook NEVER touches localStorage with an
// unscoped key. `currentUserEmail` is the authenticated account identity;
// unknown/empty account = fail closed (no read, no write). Pass it from the
// page via useAuth().
export function useCollabDoc(docId: string, currentUserEmail?: string) {
  const accountKey = docCacheAccountKey(currentUserEmail);
  const [title, setTitleState] = useState<string>('Untitled Document');
  const [blocks, setBlocksState] = useState<EditorBlock[]>(DEFAULT_BLOCKS);
  const [metadata, setMetadataState] = useState<DocumentMetadata>({ icon: '📄' });
  const [isPublic, setIsPublicState] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [collaborators, setCollaborators] = useState<DocumentCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [breadcrumbs, setBreadcrumbs] = useState<DocumentBreadcrumb[]>([]);
  const [subpages, setSubpages] = useState<DocumentSubpage[]>([]);

  const ydocRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localClientIdRef = useRef<string>('c_' + Math.random().toString(36).substring(2, 9));
  const localColorRef = useRef<string>(generateCollaboratorColor());
  const isRemoteApplyingRef = useRef<boolean>(false);
  const legacyPurgeDoneRef = useRef<boolean>(false);

  // P1 qm-drive-doc-cache-scope corrective (CODEX, same class as #1159):
  // accountKeyRef tracks the CURRENT account for stale-async guards; the
  // previous account's value is kept in state so we can hard-reset.
  const accountKeyRef = useRef<string>(accountKey);
  const [prevAccountKey, setPrevAccountKey] = useState<string>(accountKey);
  // Immutable binding: the account whose load last resolved for this mount.
  // Every write (REST autosave AND local cache) is verified against it —
  // retained prior-account state can never be saved under a new account.
  const loadedAccountRef = useRef<string | null>(null);

  // Requirement 1: on accountKey change, hard-reset title/blocks/metadata
  // (and everything else derived) to pristine empty DURING THIS RENDER,
  // before any effect reruns — so the hook never renders or writes
  // mismatched-account state.
  if (prevAccountKey !== accountKey) {
    setPrevAccountKey(accountKey);
    setTitleState('Untitled Document');
    setBlocksState(DEFAULT_BLOCKS);
    setMetadataState({ icon: '📄' });
    setIsPublicState(false);
    setCollaborators([]);
    setBreadcrumbs([]);
    setSubpages([]);
    setLastSaved(null);
    setSyncStatus('offline');
    setIsLoading(true);
  }

  // Keep the async guards in sync after the reset render commits. Declared
  // before the load effect so it runs first on the same commit: the stale
  // binding is dropped before any new load attempt starts.
  useEffect(() => {
    if (accountKeyRef.current !== accountKey) {
      accountKeyRef.current = accountKey;
      loadedAccountRef.current = null;
    }
  });

  // Synchronize title changes
  const setTitle = useCallback((newTitle: string) => {
    setTitleState(newTitle);
  }, []);

  // Synchronize block changes
  const setBlocks = useCallback(
    (action: EditorBlock[] | ((prev: EditorBlock[]) => EditorBlock[])) => {
      setBlocksState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        // Synchronize with Yjs doc if active
        if (ydocRef.current && !isRemoteApplyingRef.current) {
          const ymap = ydocRef.current.getMap('doc_data');
          const serialized = JSON.stringify(next);
          if (ymap.get('blocks') !== serialized) {
            ymap.set('blocks', serialized);
          }
        }
        return next;
      });
    },
    [],
  );

  const setMetadata = useCallback((patch: Partial<DocumentMetadata>) => {
    setMetadataState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setIsPublic = useCallback((pub: boolean) => {
    setIsPublicState(pub);
  }, []);

  // Broadcast awareness cursor location
  const broadcastCursor = useCallback((blockId?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const awarenessPayload = {
        clientId: localClientIdRef.current,
        name: 'You',
        color: localColorRef.current,
        cursorBlockId: blockId,
        lastActive: Date.now(),
      };
      wsRef.current.send(awarenessFrame(awarenessPayload));
    }
  }, []);

  // Initial fetch: Load from /api/documents/:id or localStorage
  useEffect(() => {
    let isMounted = true;

    async function loadDoc() {
      // Bind the load to the account it started for: a delayed response for
      // the previous account must never write into the new account's state.
      const keyAtStart = accountKey;
      setIsLoading(true);
      try {
        if (!keyAtStart) {
          // Unknown account: fail closed — nothing to read, pristine empty
          // remains rendered, and no save will be attempted (see autosave).
          setSyncStatus('offline');
          return;
        }
        const storage = windowDocCacheStorage();
        if (storage) {
          // qm-drive-doc-cache-scope: legacy `quant_doc_<docId>` keys are
          // unattributable plaintext — purge once per mount under an
          // authenticated session, never migrate them into the new namespace.
          if (!legacyPurgeDoneRef.current) {
            legacyPurgeDoneRef.current = true;
            purgeLegacyDocCacheKeys(storage);
          }
          const cached = readDocCache(storage, docId, keyAtStart);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (isMounted && keyAtStart === accountKeyRef.current) {
                if (parsed.title) setTitleState(parsed.title);
                if (parsed.blocks && Array.isArray(parsed.blocks)) setBlocksState(parsed.blocks);
                if (parsed.metadata) setMetadataState(parsed.metadata);
              }
            } catch {
              // Ignore parse errors on cached state
            }
          }
        }

        const res = await browserApiRequest(`/api/documents/${docId}`);
        // Late response for a superseded account — drop it entirely.
        if (!isMounted || keyAtStart !== accountKeyRef.current) return;
        if (res.ok) {
          const json = (await res.json()) as { success: boolean; data: DocumentData };
          if (json.success && json.data) {
            const doc = json.data;
            setTitleState(doc.title || 'Untitled Document');
            setIsPublicState(Boolean(doc.isPublic));

            if (doc.metadata) {
              setMetadataState(doc.metadata);
              if (Array.isArray(doc.metadata.blocks) && doc.metadata.blocks.length > 0) {
                setBlocksState(doc.metadata.blocks);
              } else if (doc.content && doc.content.trim()) {
                setBlocksState(markdownToBlocks(doc.content));
              }
            } else if (doc.content && doc.content.trim()) {
              setBlocksState(markdownToBlocks(doc.content));
            }
            if (doc.breadcrumbs && Array.isArray(doc.breadcrumbs)) {
              setBreadcrumbs(doc.breadcrumbs);
            }
            if (doc.subpages && Array.isArray(doc.subpages)) {
              setSubpages(doc.subpages);
            }
            setSyncStatus('saved');
            setLastSaved(new Date(doc.updatedAt || Date.now()));
            // Immutable binding: this content belongs to keyAtStart.
            loadedAccountRef.current = keyAtStart;
          }
        } else if (res.status === 404) {
          // New document or not yet saved in backend — seed default blocks
          // (pristine defaults already rendered). Bind the save epoch so the
          // account that creates it may autosave it.
          loadedAccountRef.current = keyAtStart;
          setSyncStatus('saved');
        } else {
          // 401/403/500: the backend rejected the read — honest error, and
          // the pristine state from the hard reset stays. loadedAccountRef
          // is NOT bound, so the autosave below refuses to write.
          setSyncStatus('error');
        }
      } catch {
        // Fallback gracefully on network error
        if (isMounted && keyAtStart === accountKeyRef.current) setSyncStatus('offline');
      } finally {
        if (isMounted && keyAtStart === accountKeyRef.current) setIsLoading(false);
      }
    }

    if (docId) {
      void loadDoc();
    }

    return () => {
      isMounted = false;
    };
  }, [docId, accountKey]);

  // Debounced auto-save to REST /api/documents/:docId
  // Manual retry counter: bumping it re-runs the effect without edits.
  const [saveAttempt, setSaveAttempt] = useState(0);
  const retrySave = useCallback(() => setSaveAttempt((n) => n + 1), []);

  useEffect(() => {
    if (isLoading) return;
    // Requirement 2: gate ALL writes (REST autosave AND local cache) on a
    // resolved, non-null accountKey. Unknown account → no writes at all.
    // loadedAccountRef binds the save epoch: the load for THIS account must
    // have resolved, otherwise the retained prior-account state would be
    // written under the new account's key before its own load settles.
    if (!accountKey || loadedAccountRef.current !== accountKey) return;

    setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saving'));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      // Re-check at fire time: the account may have changed during debounce.
      const firingAccount = accountKeyRef.current;
      if (!firingAccount || loadedAccountRef.current !== firingAccount) return;

      // Persist local copy immediately — account-scoped; fail closed when
      // the account is unknown (no shared fallback key).
      writeDocCache(
        windowDocCacheStorage(),
        docId,
        firingAccount,
        JSON.stringify({
          title,
          blocks,
          metadata,
          updatedAt: new Date().toISOString(),
        }),
      );

      const outcome = await performDocSave(
        browserApiRequest,
        docId,
        {
          title,
          content: blocksToMarkdown(blocks),
          metadata: {
            ...metadata,
            blocks,
          },
          isPublic,
        },
        // Immutable binding: the save carries the account the content was
        // loaded for; performDocSave refuses an empty binding.
        firingAccount,
      );

      if (outcome === 'saved') {
        setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saved'));
        setLastSaved(new Date());
      } else {
        // 'error' (backend rejected the write) or 'offline' (transport failed):
        // never claim 'saved' — the edits exist only in localStorage.
        setSyncStatus(outcome);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [docId, title, blocks, metadata, isPublic, isLoading, saveAttempt, accountKey]);

  // Yjs WebSocket gateway connection (/collab/:docId)
  // yjs is ~100KB+ — imported lazily so the drive/doc route bundle stays lean
  // until a document page actually mounts (same pattern as @xterm in BuildTerminal).
  // P1 qm-drive-doc-cache-scope corrective (CODEX): the effect depends on
  // accountKey as well as docId, so an account change disposes the previous
  // collaboration session (socket closed, Y.Doc destroyed) before a new one
  // starts for the new account. Unknown account → no session at all.
  useEffect(() => {
    if (typeof window === 'undefined' || !docId || !accountKey) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let ydoc: Y.Doc | null = null;
    let onDocUpdate: ((update: Uint8Array, origin: unknown) => void) | null = null;

    async function connectWebSocket(Y: typeof import('yjs'), doc: Y.Doc) {
      if (isDisposed) return;

      const token = browserAuthSession.getAccessToken();

      // Determine backend WS host:
      // Priority: NEXT_PUBLIC_WS_URL -> NEXT_PUBLIC_QUANTMAIL_BACKEND_URL -> local 3010
      let wsHost = 'localhost:3010';
      if (process.env.NEXT_PUBLIC_WS_URL) {
        wsHost = process.env.NEXT_PUBLIC_WS_URL.replace(/^wss?:\/\//, '').replace(/\/$/, '');
      } else if (process.env.NEXT_PUBLIC_QUANTMAIL_BACKEND_URL) {
        wsHost = process.env.NEXT_PUBLIC_QUANTMAIL_BACKEND_URL.replace(/^https?:\/\//, '').replace(
          /\/$/,
          '',
        );
      } else if (window.location.hostname) {
        wsHost = `${window.location.hostname}:3010`;
      }

      // SECURITY: the token never goes into the URL query string — it travels
      // as a Sec-WebSocket-Protocol `bearer.<jwt>` offer instead.
      const { url: wsUrl, protocols } = buildCollabWsHandshake({
        docId,
        wsHost,
        secure: window.location.protocol === 'https:',
        token,
      });

      try {
        ws = new WebSocket(wsUrl, protocols);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) {
            ws?.close();
            return;
          }
          setSyncStatus('connected');

          // Send Sync Step 1
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(frame(MESSAGE_SYNC, SYNC_STEP_1, Y.encodeStateVector(doc)));

            // Broadcast initial presence awareness
            ws.send(
              awarenessFrame({
                clientId: localClientIdRef.current,
                name: 'You',
                color: localColorRef.current,
                lastActive: Date.now(),
              }),
            );
          }
        };

        ws.onmessage = (event: MessageEvent) => {
          // The socket is closed when the account changes; a late message for
          // a disposed session must never apply to the new account's state.
          if (isDisposed) return;
          if (!(event.data instanceof ArrayBuffer)) return;
          const data = new Uint8Array(event.data);
          if (data.byteLength < 2) return;

          const type = data[0];
          const subtype = data[1];
          const payload = data.subarray(2);

          if (type === MESSAGE_SYNC) {
            if (subtype === SYNC_STEP_1) {
              // Respond with Step 2 containing our missing state
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(frame(MESSAGE_SYNC, SYNC_STEP_2, Y.encodeStateAsUpdate(doc, payload)));
              }
            } else if (subtype === SYNC_STEP_2 || subtype === SYNC_UPDATE) {
              isRemoteApplyingRef.current = true;
              try {
                Y.applyUpdate(doc, payload, 'websocket');
                // Check if doc_data has updated blocks
                const ymap = doc.getMap('doc_data');
                const remoteBlocksStr = ymap.get('blocks') as string | undefined;
                if (remoteBlocksStr) {
                  try {
                    const parsedBlocks = JSON.parse(remoteBlocksStr) as EditorBlock[];
                    if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
                      setBlocksState(parsedBlocks);
                    }
                  } catch {
                    // Ignore parse errors on raw CRDT payload
                  }
                }
              } finally {
                isRemoteApplyingRef.current = false;
              }
            }
          } else if (type === MESSAGE_AWARENESS) {
            try {
              const state = JSON.parse(new TextDecoder().decode(payload)) as Record<
                string,
                unknown
              >;
              const remoteClientId = state.clientId as string | undefined;
              if (remoteClientId && remoteClientId !== localClientIdRef.current) {
                setCollaborators((prev) => {
                  if (state.removed === true) {
                    return prev.filter((c) => c.clientId !== remoteClientId);
                  }
                  const existingIdx = prev.findIndex((c) => c.clientId === remoteClientId);
                  const updated: DocumentCollaborator = {
                    clientId: remoteClientId,
                    name: (state.name as string) || `Editor ${remoteClientId.slice(-3)}`,
                    color: (state.color as string) || '#58A6FF',
                    cursorBlockId: state.cursorBlockId as string | undefined,
                    lastActive: Date.now(),
                  };
                  if (existingIdx >= 0) {
                    const next = [...prev];
                    next[existingIdx] = updated;
                    return next;
                  }
                  return [...prev, updated];
                });
              }
            } catch {
              // Ignore invalid awareness JSON
            }
          }
        };

        ws.onclose = () => {
          // HONESTY: the live socket just died — never claim 'saved' here;
          // the last REST snapshot outcome is unknown. Preserve an honest
          // 'error', otherwise report 'offline'.
          setSyncStatus(resolveSocketDropStatus);
          if (!isDisposed) {
            // Reconnect with backoff
            reconnectTimer = setTimeout(() => void connectWebSocket(Y, doc), 5000);
          }
        };

        ws.onerror = () => {
          // HONESTY: same contract as onclose — 'error' stays 'error',
          // anything else becomes 'offline'. (ws.close() re-fires onclose,
          // which applies the same resolution again — idempotent.)
          setSyncStatus(resolveSocketDropStatus);
          ws?.close();
        };
      } catch {
        // HONESTY: the socket never even connected (constructor threw) —
        // a socket failure is not a successful save. Preserve 'error',
        // otherwise report 'offline'.
        setSyncStatus(resolveSocketDropStatus);
      }
    }

    // Load yjs on demand, then bind the local doc update handler and connect.
    void import('yjs').then((Y) => {
      if (isDisposed) return;
      const doc = new Y.Doc();
      ydoc = doc;
      ydocRef.current = doc;
      onDocUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin !== 'websocket' && ws?.readyState === WebSocket.OPEN) {
          ws.send(frame(MESSAGE_SYNC, SYNC_UPDATE, update));
        }
      };
      doc.on('update', onDocUpdate);
      void connectWebSocket(Y, doc);
    });

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        // Send leave awareness frame
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(awarenessFrame({ clientId: localClientIdRef.current, removed: true }));
          } catch {
            // Ignore socket errors on unmount
          }
        }
        ws.close();
      }
      if (ydoc) {
        if (onDocUpdate) ydoc.off('update', onDocUpdate);
        ydoc.destroy();
      }
      ydocRef.current = null;
    };
  }, [docId, accountKey]);

  return {
    title,
    setTitle,
    blocks,
    setBlocks,
    metadata,
    setMetadata,
    isPublic,
    setIsPublic,
    syncStatus,
    lastSaved,
    collaborators,
    isLoading,
    broadcastCursor,
    breadcrumbs,
    subpages,
    setSubpages,
    retrySave,
  };
}
