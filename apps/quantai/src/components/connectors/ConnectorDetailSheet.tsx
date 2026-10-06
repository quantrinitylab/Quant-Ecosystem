// ============================================================================
// Quanty Connectors — per-connector detail bottom sheet.
//
// Description, requested scopes, exposed tools, and honest action buttons:
// connected → Test + Disconnect; available → Connect (attempts the real flow
// and reports truth when the backend is not configured yet).
// ============================================================================

import React, { useEffect, useState } from 'react';
import type { ConsumerConnector, McpConnection } from '../../lib/connectors/catalog';
import { ConnectorIcon } from './ConnectorIcon';

export type FetchImpl = typeof fetch;

export function ConnectorDetailSheet({
  connector,
  connection,
  backendReady,
  onClose,
  onConnect,
  onDisconnect,
  onTest,
  fetchImpl,
}: {
  connector: ConsumerConnector;
  connection: McpConnection | undefined;
  backendReady: boolean;
  onClose: () => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onTest: () => Promise<{ ok: boolean; latencyMs?: number; message?: string }>;
  fetchImpl?: FetchImpl;
}) {
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'test' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const connected = !!connection && connection.status === 'connected';

  useEffect(() => {
    setNotice(null);
    setTestResult(null);
    setBusy(null);
  }, [connector.id]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  void fetchImpl;

  const run = async (kind: 'connect' | 'disconnect' | 'test', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setNotice(null);
    setTestResult(null);
    try {
      const out = await fn();
      if (kind === 'test') {
        const r = out as { ok: boolean; latencyMs?: number; message?: string };
        setTestResult(
          r.ok
            ? `Connection healthy${r.latencyMs != null ? ` · ${r.latencyMs}ms` : ''}`
            : `Test failed${r.message ? ` — ${r.message}` : ''}`,
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${connector.name} connector details`}
      data-testid={`connector-sheet-${connector.id}`}
    >
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-lg bg-[#1c1c1e] rounded-t-[28px] p-6 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-6" aria-hidden="true" />

        <div className="flex items-center gap-4 mb-2">
          <ConnectorIcon icon={connector.icon} size="lg" />
          <div className="flex-1">
            <div className="text-[22px] font-semibold text-white">{connector.name}</div>
            <div className="text-[14px] text-white/50">
              {connected ? (
                <span className="text-emerald-400 font-medium">Connected</span>
              ) : connector.deviceSource ? (
                <span className="text-white/40">Coming soon</span>
              ) : (
                <span className="text-white/40">Not connected</span>
              )}
              {connection?.via === 'ecosystem-session' && (
                <span className="text-white/40"> · via your Quant session</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-[15px] text-white/70 leading-relaxed mb-6">{connector.description}</p>

        {connector.scopes.length > 0 && (
          <div className="mb-5">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-white/40 mb-2">
              Access requested
            </div>
            <div className="flex flex-wrap gap-2">
              {connector.scopes.map((s) => (
                <span
                  key={s}
                  className="text-[13px] font-mono text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {connector.tools.length > 0 && (
          <div className="mb-6">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-white/40 mb-2">
              Tools Quanty can use
            </div>
            <div className="flex flex-wrap gap-2">
              {connector.tools.map((t) => (
                <span
                  key={t}
                  className="text-[13px] font-mono text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {notice && (
          <div className="mb-4 text-[14px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">
            {notice}
          </div>
        )}
        {testResult && (
          <div className="mb-4 text-[14px] text-white/80 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
            {testResult}
          </div>
        )}

        <div className="flex gap-3">
          {connected ? (
            <>
              {connector.builtin ? (
                <div className="flex-1 text-[14px] text-white/50 bg-white/5 rounded-2xl px-4 py-3.5 text-center">
                  Built in — always available with your Quant session.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run('test', onTest)}
                    className="flex-1 rounded-2xl bg-white/10 text-white font-medium py-3.5 disabled:opacity-50"
                  >
                    {busy === 'test' ? 'Testing…' : 'Test connection'}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run('disconnect', onDisconnect)}
                    className="flex-1 rounded-2xl bg-red-500/15 text-red-400 font-medium py-3.5 disabled:opacity-50"
                  >
                    {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </>
              )}
            </>
          ) : connector.deviceSource ? (
            <div className="flex-1 text-[14px] text-white/50 bg-white/5 rounded-2xl px-4 py-3.5 text-center">
              Device connectors are coming soon — Quanty will ask for on-device permission when they arrive.
            </div>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('connect', onConnect)}
              className="flex-1 rounded-2xl bg-[#2f7cf6] text-white font-semibold py-3.5 disabled:opacity-50"
            >
              {busy === 'connect' ? 'Connecting…' : `Connect ${connector.name}`}
            </button>
          )}
        </div>

        {!backendReady && !connected && !connector.deviceSource && !connector.builtin && (
          <p className="mt-3 text-[13px] text-white/40 text-center">
            External connectors are rolling out — connecting may report “coming soon” until the service is live.
          </p>
        )}
      </div>
    </div>
  );
}
