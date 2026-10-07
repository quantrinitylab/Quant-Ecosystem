'use client';

// ============================================================================
// Agentic - Voice Commands Hook
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceOrchestrator } from './voice-orchestrator.js';
import type { CommandResult } from '../cross-app/command-bus.js';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceCommandRecord {
  transcript: string;
  timestamp: string;
  results: CommandResult[];
}

export interface UseVoiceCommandsOptions {
  appId: string;
  userId: string;
}

export interface UseVoiceCommandsReturn {
  isListening: boolean;
  status: VoiceStatus;
  transcript: string;
  error: string | null;
  recentCommands: VoiceCommandRecord[];
  toggleListening: () => void;
  clearTranscript: () => void;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface VoiceWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const MAX_RECENT_COMMANDS = 10;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const voiceWindow = window as unknown as VoiceWindow;
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
}

function formatError(error: string): string {
  if (error === 'not-allowed') return 'Microphone access denied.';
  if (error === 'no-speech') return 'No speech detected.';
  if (error === 'audio-capture') return 'No microphone found.';
  if (error === 'network') return 'Network error during recognition.';
  return `Speech recognition error: ${error}`;
}

export function useVoiceCommands(options: UseVoiceCommandsOptions): UseVoiceCommandsReturn {
  const { appId: _appId, userId } = options;

  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recentCommands, setRecentCommands] = useState<VoiceCommandRecord[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const orchestratorRef = useRef<VoiceOrchestrator | null>(null);
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    orchestratorRef.current = new VoiceOrchestrator();
    return () => {
      orchestratorRef.current = null;
    };
  }, []);

  const processFinalTranscript = useCallback(
    async (text: string) => {
      setStatus('processing');
      setError(null);

      try {
        const orchestrator = orchestratorRef.current ?? new VoiceOrchestrator();
        const results = await orchestrator.processText(text, userId);

        setRecentCommands((prev) =>
          [
            {
              transcript: text,
              timestamp: new Date().toISOString(),
              results,
            },
            ...prev,
          ].slice(0, MAX_RECENT_COMMANDS),
        );

        setTranscript('');
        setStatus('idle');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process voice command';
        setError(message);
        setStatus('error');
      }
    },
    [userId],
  );

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // recognition may already be stopped
    }
    setIsListening(false);
    setStatus('idle');
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setError('Speech recognition is not supported in this browser.');
      setStatus('error');
      setIsListening(false);
      return;
    }

    setError(null);
    setTranscript('');
    setStatus('listening');
    setIsListening(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('listening');
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alternative = result[0];
        if (!alternative) continue;

        if (result.isFinal) {
          finalTranscript += alternative.transcript;
        } else {
          interimTranscript += alternative.transcript;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
        void processFinalTranscript(transcriptRef.current + finalTranscript);
      } else if (interimTranscript) {
        setTranscript((prev) => {
          const base = prev.trimEnd();
          return base ? `${base} ${interimTranscript.trim()}` : interimTranscript.trim();
        });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        return;
      }
      setError(formatError(event.error));
      setStatus('error');
      setIsListening(false);
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          setStatus('idle');
        }
      } else {
        setIsListening(false);
        setStatus('idle');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start speech recognition';
      setError(message);
      setStatus('error');
      setIsListening(false);
    }
  }, [processFinalTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }, [isListening, startRecognition, stopRecognition]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore cleanup errors
      }
      recognitionRef.current = null;
    };
  }, []);

  return {
    isListening,
    status,
    transcript,
    error,
    recentCommands,
    toggleListening,
    clearTranscript,
  };
}
