'use client';

import { useReducer, useCallback, useRef, useEffect } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended';

export interface CallParticipant {
  userId: string;
  username: string;
  avatarUrl: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeaking: boolean;
}

export interface CallState {
  status: CallStatus;
  roomId: string | null;
  token: string | null;
  participants: CallParticipant[];
  isMuted: boolean;
  isCameraOff: boolean;
  elapsedTime: number;
  reconnectAttempts: number;
  error: string | null;
}

// ─── Actions ───────────────────────────────────────────────────────────────────

type CallAction =
  | { type: 'INITIATE_OUTGOING'; roomId: string; token: string }
  | { type: 'RECEIVE_INCOMING'; roomId: string; callerId: string }
  | { type: 'START_CONNECTING' }
  | { type: 'CONNECTED'; participants: CallParticipant[] }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'TOGGLE_CAMERA' }
  | { type: 'UPDATE_PARTICIPANTS'; participants: CallParticipant[] }
  | { type: 'TICK_TIMER' }
  | { type: 'CONNECTION_DROPPED' }
  | { type: 'RECONNECT_ATTEMPT' }
  | { type: 'RECONNECTED' }
  | { type: 'END_CALL' }
  | { type: 'RESET' }
  | { type: 'SET_ERROR'; error: string };

// ─── Reducer ───────────────────────────────────────────────────────────────────

const initialState: CallState = {
  status: 'idle',
  roomId: null,
  token: null,
  participants: [],
  isMuted: false,
  isCameraOff: false,
  elapsedTime: 0,
  reconnectAttempts: 0,
  error: null,
};

function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'INITIATE_OUTGOING':
      return {
        ...state,
        status: 'outgoing',
        roomId: action.roomId,
        token: action.token,
        error: null,
      };

    case 'RECEIVE_INCOMING':
      return {
        ...state,
        status: 'incoming',
        roomId: action.roomId,
        error: null,
      };

    case 'START_CONNECTING':
      return {
        ...state,
        status: 'connecting',
        error: null,
      };

    case 'CONNECTED':
      return {
        ...state,
        status: 'active',
        participants: action.participants,
        elapsedTime: 0,
        reconnectAttempts: 0,
        error: null,
      };

    case 'TOGGLE_MUTE':
      return {
        ...state,
        isMuted: !state.isMuted,
      };

    case 'TOGGLE_CAMERA':
      return {
        ...state,
        isCameraOff: !state.isCameraOff,
      };

    case 'UPDATE_PARTICIPANTS':
      return {
        ...state,
        participants: action.participants,
      };

    case 'TICK_TIMER':
      return {
        ...state,
        elapsedTime: state.elapsedTime + 1,
      };

    case 'CONNECTION_DROPPED':
      return {
        ...state,
        status: 'reconnecting',
        reconnectAttempts: 0,
      };

    case 'RECONNECT_ATTEMPT':
      return {
        ...state,
        reconnectAttempts: state.reconnectAttempts + 1,
      };

    case 'RECONNECTED':
      return {
        ...state,
        status: 'active',
        reconnectAttempts: 0,
        error: null,
      };

    case 'END_CALL':
      return {
        ...state,
        status: 'ended',
      };

    case 'RESET':
      return initialState;

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
      };

    default:
      return state;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface UseCallStateReturn {
  state: CallState;
  initiateCall: (roomId: string, token: string) => void;
  receiveCall: (roomId: string, callerId: string) => void;
  acceptCall: () => void;
  connect: (participants?: CallParticipant[]) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  endCall: () => void;
  reset: () => void;
  attemptReconnect: () => void;
  reconnected: () => void;
  connectionDropped: () => void;
}

const RECONNECT_TIMEOUT_MS = 15_000;
const RECONNECT_INTERVAL_MS = 2_000;

export function useCallState(): UseCallStateReturn {
  const [state, dispatch] = useReducer(callReducer, initialState);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up reconnection timers on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    };
  }, []);

  const initiateCall = useCallback((roomId: string, token: string) => {
    dispatch({ type: 'INITIATE_OUTGOING', roomId, token });
  }, []);

  const receiveCall = useCallback((roomId: string, callerId: string) => {
    dispatch({ type: 'RECEIVE_INCOMING', roomId, callerId });
  }, []);

  const acceptCall = useCallback(() => {
    dispatch({ type: 'START_CONNECTING' });
  }, []);

  const connect = useCallback((participants?: CallParticipant[]) => {
    dispatch({ type: 'CONNECTED', participants: participants ?? [] });
  }, []);

  const toggleMute = useCallback(() => {
    dispatch({ type: 'TOGGLE_MUTE' });
  }, []);

  const toggleCamera = useCallback(() => {
    dispatch({ type: 'TOGGLE_CAMERA' });
  }, []);

  const endCall = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    dispatch({ type: 'END_CALL' });
  }, []);

  const reset = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    dispatch({ type: 'RESET' });
  }, []);

  const connectionDropped = useCallback(() => {
    dispatch({ type: 'CONNECTION_DROPPED' });

    // Start reconnection attempts for up to 15 seconds
    reconnectIntervalRef.current = setInterval(() => {
      dispatch({ type: 'RECONNECT_ATTEMPT' });
    }, RECONNECT_INTERVAL_MS);

    // After 15s, give up and show connection lost
    reconnectTimerRef.current = setTimeout(() => {
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
      dispatch({ type: 'SET_ERROR', error: 'Connection lost' });
    }, RECONNECT_TIMEOUT_MS);
  }, []);

  const attemptReconnect = useCallback(() => {
    dispatch({ type: 'RECONNECT_ATTEMPT' });
  }, []);

  const reconnected = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    dispatch({ type: 'RECONNECTED' });
  }, []);

  return {
    state,
    initiateCall,
    receiveCall,
    acceptCall,
    connect,
    toggleMute,
    toggleCamera,
    endCall,
    reset,
    attemptReconnect,
    reconnected,
    connectionDropped,
  };
}
