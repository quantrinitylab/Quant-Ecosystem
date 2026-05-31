import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';

export interface Document {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  owner: string;
  collaborators: string[];
  version: number;
}

export function useDocument(id: string) {
  return useQuery<Document>({
    queryKey: ['document', id],
    queryFn: async () => {
      const response = await fetch(`/api/docs/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      return response.json();
    },
    enabled: !!id,
  });
}

export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
  cursor?: { index: number; length: number };
  isTyping?: boolean;
}

export interface UseYjsDocReturn {
  doc: Y.Doc;
  connected: boolean;
  synced: boolean;
  isReconnecting: boolean;
  offlineChanges: number;
  awareness: Map<string, AwarenessUser>;
  broadcastCursor: (cursor: { index: number; length: number }) => void;
  disconnect: () => void;
}

const YJS_WS_URL = process.env.NEXT_PUBLIC_YJS_WS_URL || 'ws://localhost:3040/ws';

export function useYjsDoc(
  documentId: string,
  user?: { id: string; name: string; color: string },
): UseYjsDocReturn {
  const docRef = useRef<Y.Doc>(new Y.Doc());
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [offlineChanges, setOfflineChanges] = useState(0);
  const [awareness, setAwareness] = useState<Map<string, AwarenessUser>>(new Map());

  const offlineQueueRef = useRef<Uint8Array[]>([]);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectDelay = 30000;
  const intentionalDisconnectRef = useRef(false);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setSynced(false);
    setIsReconnecting(false);
  }, []);

  const broadcastCursor = useCallback(
    (cursor: { index: number; length: number }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && user) {
        const msg = JSON.stringify({
          type: 'awareness',
          user: { ...user, cursor },
        });
        wsRef.current.send(msg);
      }
    },
    [user],
  );

  const flushOfflineQueue = useCallback((ws: WebSocket) => {
    const queue = offlineQueueRef.current;
    if (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
      for (const update of queue) {
        ws.send(update);
      }
      offlineQueueRef.current = [];
      setOfflineChanges(0);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!documentId) return;

    const doc = docRef.current;
    const wsUrl = `${YJS_WS_URL}/${documentId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      setConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;

      // Send initial sync step 1
      const encodedState = Y.encodeStateVector(doc);
      ws.send(encodedState);

      // Send awareness info
      if (user) {
        const awarenessMsg = JSON.stringify({ type: 'awareness', user });
        ws.send(awarenessMsg);
      }

      // Flush any offline queued updates
      flushOfflineQueue(ws);
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        // Awareness update
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'awareness' && msg.users) {
            const newAwareness = new Map<string, AwarenessUser>();
            for (const u of msg.users) {
              newAwareness.set(u.id, u);
            }
            setAwareness(newAwareness);
          }
        } catch {
          // Ignore parse errors
        }
      } else {
        // Binary Yjs update
        const update = new Uint8Array(event.data);
        Y.applyUpdate(doc, update, 'remote');
        setSynced(true);
      }
    });

    ws.addEventListener('close', () => {
      setConnected(false);
      // Attempt reconnection with exponential backoff if not intentional
      if (!intentionalDisconnectRef.current) {
        scheduleReconnect();
      }
    });

    ws.addEventListener('error', () => {
      setConnected(false);
    });

    // Listen for local updates and send to server (or queue offline)
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(update);
      } else {
        // Buffer updates when disconnected
        offlineQueueRef.current.push(update);
        setOfflineChanges(offlineQueueRef.current.length);
      }
    };
    doc.on('update', updateHandler);

    return () => {
      doc.off('update', updateHandler);
    };
  }, [documentId, user, flushOfflineQueue]);

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) return;

    setIsReconnecting(true);
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), maxReconnectDelay);
    reconnectAttemptsRef.current = attempt + 1;

    reconnectTimerRef.current = setTimeout(() => {
      if (!intentionalDisconnectRef.current) {
        connectWs();
      }
    }, delay);
  }, [connectWs]);

  useEffect(() => {
    if (!documentId) return;

    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;

    const cleanup = connectWs();

    return () => {
      intentionalDisconnectRef.current = true;
      if (cleanup) cleanup();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setSynced(false);
      setIsReconnecting(false);
    };
  }, [documentId, connectWs]);

  return {
    doc: docRef.current,
    connected,
    synced,
    isReconnecting,
    offlineChanges,
    awareness,
    broadcastCursor,
    disconnect,
  };
}
