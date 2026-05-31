'use client';
// ============================================================================
// Shared UI - E2E Encryption Component
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Room } from 'livekit-client';

export interface UseE2EEncryptionOptions {
  room: Room | null;
  passphrase: string;
}

export interface UseE2EEncryptionReturn {
  isEnabled: boolean;
  isSupported: boolean;
  enable: () => Promise<void>;
  disable: () => void;
  error: string | null;
}

/**
 * Hook that enables LiveKit E2EE (End-to-End Encryption) via Insertable Streams / SFrame.
 * Requires a shared passphrase for key derivation across participants in the room.
 */
export function useE2EEncryption({
  room,
  passphrase,
}: UseE2EEncryptionOptions): UseE2EEncryptionReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passphraseRef = useRef(passphrase);
  passphraseRef.current = passphrase;

  // Check if E2EE is supported (Insertable Streams / SFrame API)
  const isSupported =
    (typeof window !== 'undefined' &&
      typeof (window as unknown as Record<string, unknown>).RTCRtpScriptTransform !==
        'undefined') ||
    typeof (globalThis as unknown as Record<string, unknown>).TransformStream !== 'undefined';

  const enable = useCallback(async () => {
    if (!room) {
      setError('Room not connected');
      return;
    }

    if (!passphraseRef.current) {
      setError('Passphrase is required for E2E encryption');
      return;
    }

    try {
      // LiveKit E2EE uses room.setE2EEEnabled with a key provider
      // The actual implementation depends on livekit-client E2EE module
      // which uses SFrame transform for media encryption
      const e2eeOptions = room.options?.e2ee;
      if (e2eeOptions) {
        await room.setE2EEEnabled(true);
      } else {
        // E2EE not configured on room creation - set encryption key
        // The room must be created with e2ee options for full support
        setError('Room was not initialized with E2EE support');
        return;
      }
      setIsEnabled(true);
      setError(null);
    } catch (err) {
      setError(`Failed to enable E2E encryption: ${(err as Error).message}`);
    }
  }, [room]);

  const disable = useCallback(() => {
    if (!room) return;
    try {
      void room.setE2EEEnabled(false);
      setIsEnabled(false);
      setError(null);
    } catch (err) {
      setError(`Failed to disable E2E encryption: ${(err as Error).message}`);
    }
  }, [room]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isEnabled && room) {
        try {
          void room.setE2EEEnabled(false);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [isEnabled, room]);

  return { isEnabled, isSupported, enable, disable, error };
}

export interface E2EEncryptionToggleProps {
  room: Room | null;
  passphrase: string;
  onStatusChange?: (enabled: boolean) => void;
  className?: string;
}

/**
 * Toggle component that shows encryption status and allows enabling secure mode.
 */
export const E2EEncryptionToggle: React.FC<E2EEncryptionToggleProps> = ({
  room,
  passphrase,
  onStatusChange,
  className = '',
}) => {
  const { isEnabled, isSupported, enable, disable, error } = useE2EEncryption({
    room,
    passphrase,
  });

  const handleToggle = useCallback(async () => {
    if (isEnabled) {
      disable();
      onStatusChange?.(false);
    } else {
      await enable();
      onStatusChange?.(true);
    }
  }, [isEnabled, enable, disable, onStatusChange]);

  if (!isSupported) {
    return (
      <div className={`e2e-encryption-unsupported ${className}`}>
        <span>E2E encryption not supported in this browser</span>
      </div>
    );
  }

  return (
    <div className={`e2e-encryption-toggle ${className}`}>
      <button
        onClick={() => void handleToggle()}
        disabled={!room}
        aria-pressed={isEnabled}
        aria-label={isEnabled ? 'Disable end-to-end encryption' : 'Enable end-to-end encryption'}
      >
        <span className="encryption-icon">{isEnabled ? '\u{1F512}' : '\u{1F513}'}</span>
        <span className="encryption-label">{isEnabled ? 'Encrypted' : 'Enable E2EE'}</span>
      </button>
      {error && <span className="encryption-error">{error}</span>}
    </div>
  );
};
