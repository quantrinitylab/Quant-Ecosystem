import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildTerminal, type BuildTerminalProps } from '../components/BuildTerminal';

describe('BuildTerminal Component', () => {
  it('exports BuildTerminal component with valid contract', () => {
    expect(BuildTerminal).toBeDefined();
    expect(typeof BuildTerminal).toBe('function');
  });

  it('renders initial terminal structure with run name and build ID', () => {
    const html = renderToStaticMarkup(
      <BuildTerminal
        buildId="build-101"
        runName="CI / test"
        autoConnect={false}
        initialLogs={['[Init] Container booting...', '[Sandbox] Systrap kernel attached']}
      />,
    );

    // Verify container and data-testids
    expect(html).toContain('data-testid="build-terminal"');
    expect(html).toContain('data-testid="terminal-container"');
    expect(html).toContain('data-testid="search-input"');
    expect(html).toContain('data-testid="autoscroll-toggle"');
    expect(html).toContain('data-testid="copy-btn"');
    expect(html).toContain('data-testid="clear-btn"');

    // Verify labels and title
    expect(html).toContain('Terminal: CI / test');
    expect(html).toContain('Scroll: ON');
    expect(html).toContain('Copy');
    expect(html).toContain('Clear');
  });

  it('renders fallback title when runName is not provided', () => {
    const html = renderToStaticMarkup(<BuildTerminal buildId="42" autoConnect={false} />);

    expect(html).toContain('Terminal: Build #42');
    expect(html).toContain('CONNECTING...');
  });

  it('renders initial logs in accessible log buffer', () => {
    const initialLogs = [
      'Step 1/3: Checking out repository',
      'Step 2/3: Installing dependencies with pnpm',
      'Step 3/3: Running vitest suites',
    ];

    const html = renderToStaticMarkup(
      <BuildTerminal buildId="build-202" autoConnect={false} initialLogs={initialLogs} />,
    );

    expect(html).toContain('Step 1/3: Checking out repository');
    expect(html).toContain('Step 2/3: Installing dependencies with pnpm');
    expect(html).toContain('Step 3/3: Running vitest suites');
  });

  it('renders close button when onClose handler is provided', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <BuildTerminal buildId="build-303" autoConnect={false} onClose={onClose} />,
    );

    expect(html).toContain('title="Close Terminal"');
    expect(html).toContain('✕');
  });
});
