'use client';

import { useState } from 'react';
import { VoiceCommandBar } from '@quant/shared-ui';

export interface VoiceCommandHostProps {
  appId: string;
  userId?: string;
}

export function VoiceCommandHost({ appId, userId = 'guest' }: VoiceCommandHostProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      {isOpen ? (
        <VoiceCommandBar appId={appId} userId={userId} onClose={() => setIsOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 p-3 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Open voice commands"
        >
          <span aria-hidden="true">&#127908;</span>
        </button>
      )}
    </>
  );
}
