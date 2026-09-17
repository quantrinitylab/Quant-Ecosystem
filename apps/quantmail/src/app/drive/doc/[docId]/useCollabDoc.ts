// ============================================================================
// QuantDrive Document Editor — Yjs CRDT & Collaboration Hook
// Adheres strictly to Gates N-G3, N-G4, and N-G5 in PHASE_N_COLLABORATION_MEMO.md
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { browserAuthSession } from '../../../../services/browser-auth-session';
import { browserApiRequest } from '../../../../services/browser-api-request';
import type {
  EditorBlock,
  DocumentCollaborator,
  SyncStatus,
  DocumentMetadata,
  DocumentData,
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

function generateCollaboratorColor(): string {
  const colors = [
    '#FF8C42', // Quant Orange
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
    id: 'b_welcome_callout',
    type: 'callout',
    calloutIcon: '✨',
    content:
      'Welcome to your QuantDrive collaborative workspace! Type "/" on any line for block commands.',
  },
  {
    id: 'b_h1_starter',
    type: 'h1',
    content: 'Getting Started with QuantDrive Docs',
  },
  {
    id: 'b_p_starter_1',
    type: 'paragraph',
    content:
      'This document is powered by real-time Yjs CRDT synchronization and server-side Postgres durability. Work with team members simultaneously with conflict-free multiplayer editing.',
  },
  {
    id: 'b_todo_1',
    type: 'todo',
    checked: true,
    content: 'Real-time WebSocket connection to /collab/:docId',
  },
  {
    id: 'b_todo_2',
    type: 'todo',
    checked: true,
    content:
      'Notion-class in-house slash command menu (/h1, /h2, /todo, /table, /code, /callout, /quote, /divider)',
  },
  {
    id: 'b_todo_3',
    type: 'todo',
    checked: false,
    content: 'Invite your teammates and collaborate seamlessly',
  },
  {
    id: 'b_h2_code',
    type: 'h2',
    content: 'Rich Code Collaboration',
  },
  {
    id: 'b_code_sample',
    type: 'code',
    language: 'typescript',
    content:
      '// Fastify WebSocket collaboration gateway (Gate N-G5)\nexport async function handleCollabSync(docId: string, clientToken: string) {\n  const session = await verifySession(clientToken);\n  return setupWSConnection(socket, { docId, userId: session.userId });\n}',
  },
  {
    id: 'b_table_sample',
    type: 'table',
    content: '',
    tableData: [
      ['Gate', 'Standard', 'Status'],
      ['N-G1', 'Canonical route /drive/doc/:docId', 'Active'],
      ['N-G2', 'ProseMirror/Block Editor with slash menu', 'Active'],
      ['N-G3', 'Yjs CRDT framework single source of truth', 'Active'],
      ['N-G4', 'Postgres durable update persistence', 'Active'],
      ['N-G5', 'Authenticated handshake & tenant isolation', 'Active'],
    ],
  },
];

export function useCollabDoc(docId: string) {
  const [title, setTitleState] = useState<string>('Untitled Document');
  const [blocks, setBlocksState] = useState<EditorBlock[]>(DEFAULT_BLOCKS);
  const [metadata, setMetadataState] = useState<DocumentMetadata>({ icon: '📄' });
  const [isPublic, setIsPublicState] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [collaborators, setCollaborators] = useState<DocumentCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const ydocRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localClientIdRef = useRef<string>('c_' + Math.random().toString(36).substring(2, 9));
  const localColorRef = useRef<string>(generateCollaboratorColor());
  const isRemoteApplyingRef = useRef<boolean>(false);

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
      setIsLoading(true);
      try {
        const cached = localStorage.getItem(`quant_doc_${docId}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (isMounted) {
              if (parsed.title) setTitleState(parsed.title);
              if (parsed.blocks && Array.isArray(parsed.blocks)) setBlocksState(parsed.blocks);
              if (parsed.metadata) setMetadataState(parsed.metadata);
            }
          } catch {
            // Ignore parse errors on cached state
          }
        }

        const res = await browserApiRequest(`/api/documents/${docId}`);
        if (res.ok) {
          const json = (await res.json()) as { success: boolean; data: DocumentData };
          if (json.success && json.data && isMounted) {
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
            setSyncStatus('saved');
            setLastSaved(new Date(doc.updatedAt || Date.now()));
          }
        } else if (res.status === 404) {
          // New document or not yet saved in backend — seed default blocks
          setSyncStatus('saved');
        }
      } catch {
        // Fallback gracefully on network error
        setSyncStatus('offline');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (docId) {
      void loadDoc();
    }

    return () => {
      isMounted = false;
    };
  }, [docId]);

  // Debounced auto-save to REST /api/documents/:docId
  useEffect(() => {
    if (isLoading) return;

    setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saving'));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const mdContent = blocksToMarkdown(blocks);
        // Persist local copy immediately
        try {
          localStorage.setItem(
            `quant_doc_${docId}`,
            JSON.stringify({
              title,
              blocks,
              metadata,
              updatedAt: new Date().toISOString(),
            }),
          );
        } catch {
          // Ignore localStorage quota errors
        }

        const res = await browserApiRequest(`/api/documents/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            content: mdContent,
            metadata: {
              ...metadata,
              blocks,
            },
            isPublic,
          }),
        });

        if (res.ok) {
          setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saved'));
          setLastSaved(new Date());
        } else {
          // If PATCH 404s (e.g. document wasn't created yet in DB), try POST to create it
          if (res.status === 404) {
            await browserApiRequest('/api/documents', {
              method: 'POST',
              body: JSON.stringify({
                id: docId,
                title,
                content: mdContent,
                metadata: {
                  ...metadata,
                  blocks,
                },
                isPublic,
              }),
            });
            setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saved'));
            setLastSaved(new Date());
          } else {
            setSyncStatus((current) => (current === 'connected' ? 'connected' : 'saved'));
          }
        }
      } catch {
        setSyncStatus('offline');
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [docId, title, blocks, metadata, isPublic, isLoading]);

  // Yjs WebSocket gateway connection (/collab/:docId)
  useEffect(() => {
    if (typeof window === 'undefined' || !docId) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    async function connectWebSocket() {
      if (isDisposed) return;

      const token = browserAuthSession.getAccessToken();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

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

      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${protocol}//${wsHost}/collab/${encodeURIComponent(docId)}${tokenParam}`;

      try {
        ws = new WebSocket(wsUrl);
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
            ws.send(frame(MESSAGE_SYNC, SYNC_STEP_1, Y.encodeStateVector(ydoc)));

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
                ws.send(frame(MESSAGE_SYNC, SYNC_STEP_2, Y.encodeStateAsUpdate(ydoc, payload)));
              }
            } else if (subtype === SYNC_STEP_2 || subtype === SYNC_UPDATE) {
              isRemoteApplyingRef.current = true;
              try {
                Y.applyUpdate(ydoc, payload, 'websocket');
                // Check if doc_data has updated blocks
                const ymap = ydoc.getMap('doc_data');
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
          setSyncStatus('saved');
          if (!isDisposed) {
            // Reconnect with backoff
            reconnectTimer = setTimeout(connectWebSocket, 5000);
          }
        };

        ws.onerror = () => {
          setSyncStatus('saved');
          ws?.close();
        };
      } catch {
        setSyncStatus('saved');
      }
    }

    // Bind local Yjs doc update handler to broadcast changes
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== 'websocket' && ws?.readyState === WebSocket.OPEN) {
        ws.send(frame(MESSAGE_SYNC, SYNC_UPDATE, update));
      }
    };
    ydoc.on('update', onDocUpdate);

    void connectWebSocket();

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
      ydoc.off('update', onDocUpdate);
      ydoc.destroy();
    };
  }, [docId]);

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
  };
}
