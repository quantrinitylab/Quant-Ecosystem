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
}

export interface UseYjsDocReturn {
  doc: Y.Doc;
  connected: boolean;
  synced: boolean;
  awareness: Map<string, AwarenessUser>;
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
  const [awareness, setAwareness] = useState<Map<string, AwarenessUser>>(new Map());

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setSynced(false);
  }, []);

  useEffect(() => {
    if (!documentId) return;

    const doc = docRef.current;
    const wsUrl = `${YJS_WS_URL}/${documentId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      setConnected(true);
      // Send initial sync step 1
      const encodedState = Y.encodeStateVector(doc);
      ws.send(encodedState);

      // Send awareness info
      if (user) {
        const awarenessMsg = JSON.stringify({ type: 'awareness', user });
        ws.send(awarenessMsg);
      }
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
        Y.applyUpdate(doc, update);
        setSynced(true);
      }
    });

    ws.addEventListener('close', () => {
      setConnected(false);
    });

    ws.addEventListener('error', () => {
      setConnected(false);
    });

    // Listen for local updates and send to server
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote' && ws.readyState === WebSocket.OPEN) {
        ws.send(update);
      }
    };
    doc.on('update', updateHandler);

    return () => {
      doc.off('update', updateHandler);
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setSynced(false);
    };
  }, [documentId, user]);

  return {
    doc: docRef.current,
    connected,
    synced,
    awareness,
    disconnect,
  };
}
