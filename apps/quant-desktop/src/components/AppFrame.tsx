import React, { useState } from 'react';
import type { QuantAppDefinition } from '../types';

interface AppFrameProps {
  app: QuantAppDefinition;
  onRefresh?: () => void;
}

export function AppFrame({ app }: AppFrameProps): React.ReactElement {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [useLiveIframe, setUseLiveIframe] = useState(false);
  const [key, setKey] = useState(0);

  const localUrl = `http://localhost:${app.defaultPort}`;
  const sovereignUrl = `quant://${app.id}.local${app.route}`;

  const handleRefresh = () => {
    setKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(localUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="app-frame-container">
      {/* Sovereign Address & Navigation Bar */}
      <div className="app-frame-nav">
        <div className="nav-controls">
          <button className="nav-btn" title="Back" aria-label="Go Back">
            ←
          </button>
          <button className="nav-btn" title="Forward" aria-label="Go Forward">
            →
          </button>
          <button
            className="nav-btn"
            onClick={handleRefresh}
            title="Reload Frame"
            aria-label="Reload Frame"
          >
            ↻
          </button>
        </div>

        <div className="sovereign-address-bar">
          <span className="address-shield" title="Sovereign CAS E2EE Verified">
            🔒
          </span>
          <span style={{ color: app.accentColor }}>{sovereignUrl}</span>
          <span style={{ color: 'var(--text-subtle)', marginLeft: 'auto' }}>
            Port {app.defaultPort}
          </span>
        </div>

        <div className="nav-controls">
          <button
            className="nav-btn"
            style={{ width: 'auto', padding: '0 8px', fontSize: '11px' }}
            onClick={() => setUseLiveIframe(!useLiveIframe)}
            title="Toggle between Live Server IFrame and Sovereign Preview Mode"
          >
            {useLiveIframe ? 'Live Server View' : 'Sovereign Standalone Mode'}
          </button>
          <button
            className="nav-btn"
            onClick={handleOpenExternal}
            title={`Open ${app.name} in external browser (${localUrl})`}
            aria-label="Open in external browser"
          >
            ↗
          </button>
        </div>
      </div>

      {/* Frame Viewport */}
      <div className="app-frame-viewport">
        {useLiveIframe ? (
          <iframe
            key={key}
            src={localUrl}
            title={app.name}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setIframeLoaded(true)}
          />
        ) : (
          <div className="app-preview-dashboard">
            <div className="preview-hero">
              <div className="preview-hero-left">
                <span className="preview-icon-large">{app.icon}</span>
                <div>
                  <h1 className="preview-hero-title">{app.name}</h1>
                  <p className="preview-hero-sub">{app.tagline}</p>
                </div>
              </div>
              <div className="preview-badge-pill">{app.badge}</div>
            </div>

            <div className="preview-features-grid">
              {app.features.map((feature, i) => (
                <div key={i} className="preview-feature-card">
                  <div className="preview-card-title">{feature}</div>
                  <div className="preview-card-desc">
                    {app.description} Sovereign engine integrated with local FastCDC CAS.
                  </div>
                </div>
              ))}
            </div>

            {/* App specific interactive preview panels */}
            {renderAppSpecificWidget(app)}
          </div>
        )}
      </div>
    </main>
  );
}

function renderAppSpecificWidget(app: QuantAppDefinition): React.ReactElement {
  switch (app.id) {
    case 'quantmail':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">
            ✉️ Sovereign Mailbox Preview (RFC 5322 MIME Engine)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
              }}
            >
              <span>
                📥 <strong>Linus Torvalds</strong> — Sovereign Linux Git Patch Merge Verification
              </span>
              <span style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                10:42 AM
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
              }}
            >
              <span>
                📥 <strong>Quant Swarm Dispatch</strong> — Wave 40 CAS Hydrator Verification
                Complete
              </span>
              <span style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                09:15 AM
              </span>
            </div>
          </div>
        </div>
      );

    case 'codehub':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">🐙 Smart HTTP & Native Git 3-Way PR Merge Engine</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#34d399',
              marginTop: '8px',
              background: 'rgba(0,0,0,0.4)',
              padding: '10px',
              borderRadius: '6px',
            }}
          >
            <div>$ git remote -v</div>
            <div>origin quant://code.quant.local/repos/quant-ecosystem.git (fetch)</div>
            <div>[OK] Fast-forward 3-way merge clean. Smart HTTP streaming active.</div>
          </div>
        </div>
      );

    case 'quantdrive':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">
            📁 FastCDC 64KB Gear CAS Virtual Drive (ProjFS Mounted G:\)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginTop: '10px',
            }}
          >
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>MOUNTED DRIVE</div>
              <div style={{ fontWeight: 600, color: '#f59e0b' }}>G:\ (Windows ProjFS)</div>
            </div>
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>DEDUPLICATION</div>
              <div style={{ fontWeight: 600, color: '#34d399' }}>4.8x Gear CAS</div>
            </div>
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>OFFLINE STATE</div>
              <div style={{ fontWeight: 600, color: '#38bdf8' }}>0-Byte Placeholders</div>
            </div>
          </div>
        </div>
      );

    case 'quantchat':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">💬 Double Ratchet E2EE Real-time Federation</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <span
              style={{
                padding: '4px 8px',
                background: 'rgba(139, 92, 246, 0.15)',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#c4b5fd',
              }}
            >
              🔒 Pre-key Bundle Verified
            </span>
            <span
              style={{
                padding: '4px 8px',
                background: 'rgba(16, 185, 129, 0.15)',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#6ee7b7',
              }}
            >
              ⚡ WebSocket Heartbeat Active
            </span>
          </div>
        </div>
      );

    case 'quantube':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">▶️ Adaptive 4K HLS Media Pipeline & Shorts Feed</div>
          <div
            style={{
              marginTop: '10px',
              padding: '12px',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '24px' }}>🎬</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Unauthenticated Zero-Tracking Segmented Media Player Ready
            </p>
          </div>
        </div>
      );

    case 'quantai':
      return (
        <div className="preview-feature-card" style={{ marginTop: '12px' }}>
          <div className="preview-card-title">🧠 Tripartite 15-Agent Swarm Autonomous OS</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginTop: '10px',
            }}
          >
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>NODE A (IDE LEAD)</div>
              <div style={{ fontWeight: 600, color: '#06b6d4' }}>Active (A1-A5)</div>
            </div>
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>NODE B (IDE PEER)</div>
              <div style={{ fontWeight: 600, color: '#8b5cf6' }}>Active (B1-B5)</div>
            </div>
            <div
              style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>NODE C (CLI agy)</div>
              <div style={{ fontWeight: 600, color: '#10b981' }}>Active (C1-C5)</div>
            </div>
          </div>
        </div>
      );
  }
}
