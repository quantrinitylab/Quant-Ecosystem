'use client';

// ============================================================================
// MessagingChannelsSection — messaging channel connections.
// HONEST: no channel backends exist yet, so every row is a disabled
// "coming soon" — never a fake connected state.
// ============================================================================

import React from 'react';

const CHANNELS = [
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'telegram', name: 'Telegram', icon: '✈️' },
  { id: 'discord', name: 'Discord', icon: '🎮' },
  { id: 'slack', name: 'Slack', icon: '💼' },
];

export default function MessagingChannelsSection() {
  return (
    <div>
      <p className="mb-3 text-[13px] text-white/50">
        Let Quanty reach you on your messaging apps. Channels are not available yet.
      </p>
      <ul className="divide-y divide-white/10">
        {CHANNELS.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3 opacity-60">
            <span className="text-[22px]" aria-hidden="true">{c.icon}</span>
            <span className="flex-1 text-[15px] text-white">{c.name}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/60">Coming soon</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
