// ============================================================================
// QuantEdits - useCollaboration Hook
// Real-time collaboration state: presence, operations, sync
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  isOnline: boolean;
  lastSeen: number;
  permission: 'view' | 'comment' | 'edit';
}

interface CollabOperation {
  id: string;
  userId: string;
  type: 'add' | 'update' | 'delete' | 'move';
  target: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface CollabState {
  isConnected: boolean;
  collaborators: Collaborator[];
  pendingOperations: CollabOperation[];
  sessionId: string | null;
  error: string | null;
}

interface UseCollaborationReturn {
  state: CollabState;
  connect: (projectId: string, userId: string) => void;
  disconnect: () => void;
  updateCursor: (x: number, y: number) => void;
  updateSelection: (elementIds: string[]) => void;
  sendOperation: (op: Omit<CollabOperation, 'id' | 'timestamp'>) => void;
  inviteUser: (email: string, permission: Collaborator['permission']) => void;
  removeUser: (userId: string) => void;
  changePermission: (userId: string, permission: Collaborator['permission']) => void;
}

export function useCollaboration(): UseCollaborationReturn {
  const [state, setState] = useState<CollabState>({
    isConnected: false,
    collaborators: [],
    pendingOperations: [],
    sessionId: null,
    error: null,
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback((projectId: string, userId: string) => {
    setState((prev) => ({
      ...prev,
      isConnected: true,
      sessionId: `session-${Date.now()}`,
      error: null,
    }));
    heartbeatRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        collaborators: prev.collaborators.map((c) => ({
          ...c,
          isOnline: Date.now() - c.lastSeen < 30000,
        })),
      }));
    }, 10000);
  }, []);

  const disconnect = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    setState((prev) => ({ ...prev, isConnected: false, sessionId: null }));
  }, []);

  const updateCursor = useCallback(
    (_x: number, _y: number) => {
      if (!state.isConnected) return;
    },
    [state.isConnected],
  );

  const updateSelection = useCallback(
    (_elementIds: string[]) => {
      if (!state.isConnected) return;
    },
    [state.isConnected],
  );

  const sendOperation = useCallback(
    (op: Omit<CollabOperation, 'id' | 'timestamp'>) => {
      if (!state.isConnected) return;
      const fullOp: CollabOperation = { ...op, id: `op-${Date.now()}`, timestamp: Date.now() };
      setState((prev) => ({ ...prev, pendingOperations: [...prev.pendingOperations, fullOp] }));
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          pendingOperations: prev.pendingOperations.filter((p) => p.id !== fullOp.id),
        }));
      }, 500);
    },
    [state.isConnected],
  );

  const inviteUser = useCallback((email: string, permission: Collaborator['permission']) => {
    const newCollab: Collaborator = {
      id: `user-${Date.now()}`,
      name: email.split('@')[0],
      email,
      avatar: '',
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      cursor: null,
      selection: [],
      isOnline: false,
      lastSeen: 0,
      permission,
    };
    setState((prev) => ({ ...prev, collaborators: [...prev.collaborators, newCollab] }));
  }, []);

  const removeUser = useCallback((userId: string) => {
    setState((prev) => ({
      ...prev,
      collaborators: prev.collaborators.filter((c) => c.id !== userId),
    }));
  }, []);

  const changePermission = useCallback((userId: string, permission: Collaborator['permission']) => {
    setState((prev) => ({
      ...prev,
      collaborators: prev.collaborators.map((c) => (c.id === userId ? { ...c, permission } : c)),
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []);

  return {
    state,
    connect,
    disconnect,
    updateCursor,
    updateSelection,
    sendOperation,
    inviteUser,
    removeUser,
    changePermission,
  };
}

export default useCollaboration;
