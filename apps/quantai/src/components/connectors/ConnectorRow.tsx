// ============================================================================
// Quanty Connectors — row (Muse screenshot style).
//
// Connected rows: icon + name + chevron (tap → detail sheet).
// Available rows: icon + name (+ "From this device" subtitle) + Connect button
//   or an honest "Coming soon" badge for device-source providers.
// ============================================================================

import React from 'react';
import type { ConsumerConnector } from '../../lib/connectors/catalog';
import { ConnectorIcon } from './ConnectorIcon';

export type RowAction =
  | { kind: 'open' }
  | { kind: 'connect' }
  | { kind: 'none' };

export function ConnectorRow({
  connector,
  connected,
  onAction,
  connecting,
}: {
  connector: ConsumerConnector;
  connected: boolean;
  onAction: (action: RowAction) => void;
  connecting?: boolean;
}) {
  const comingSoon = !!connector.deviceSource;

  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      data-testid={`connector-row-${connector.id}`}
    >
      <ConnectorIcon icon={connector.icon} />
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-medium text-white truncate">{connector.name}</div>
        {connector.deviceSource && (
          <div className="text-[13px] text-white/40">From this device</div>
        )}
        {connector.builtin && !connected && (
          <div className="text-[13px] text-white/40">Built in</div>
        )}
      </div>

      {connected ? (
        <button
          type="button"
          onClick={() => onAction({ kind: 'open' })}
          aria-label={`Open ${connector.name} details`}
          className="p-2 -mr-2 text-white/40 hover:text-white/70"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : comingSoon ? (
        <span
          className="text-[13px] font-medium text-white/35 bg-white/5 border border-white/10 rounded-full px-3 py-1.5"
          title="Device connectors are not available yet"
        >
          Coming soon
        </span>
      ) : (
        <button
          type="button"
          disabled={!!connecting}
          onClick={() => onAction({ kind: 'connect' })}
          aria-label={`Connect ${connector.name}`}
          className="text-[17px] font-medium text-[#2f7cf6] hover:text-[#5b9bff] disabled:opacity-50 disabled:cursor-wait px-1"
        >
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  );
}
