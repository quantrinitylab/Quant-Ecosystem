'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface BuildTerminalProps {
  buildId: string | number;
  runName?: string;
  streamUrl?: string;
  initialLogs?: string[];
  onClose?: () => void;
  autoConnect?: boolean;
  height?: string;
}

export type StreamStatus = 'connecting' | 'live' | 'completed' | 'failed' | 'disconnected';

export function BuildTerminal({
  buildId,
  runName,
  streamUrl,
  initialLogs = [],
  onClose,
  autoConnect = true,
  height,
}: BuildTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const searchAddonRef = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [logBuffer, setLogBuffer] = useState<string[]>(initialLogs);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Initialize xterm terminal safely on client-side
  useEffect(() => {
    let isMounted = true;

    async function initTerminal() {
      if (typeof window === 'undefined' || !containerRef.current) return;

      try {
        const { Terminal } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const { SearchAddon } = await import('@xterm/addon-search');
        const { WebLinksAddon } = await import('@xterm/addon-web-links');
        // @ts-expect-error - CSS asset import without d.ts
        await import('@xterm/xterm/css/xterm.css');

        if (!isMounted || !containerRef.current) return;

        // Clean container if previously initialized
        containerRef.current.innerHTML = '';

        const term = new Terminal({
          cursorBlink: true,
          fontSize: 12,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#0D1117',
            foreground: '#C9D1D9',
            cursor: '#58A6FF',
            selectionBackground: '#1F6FEB44',
            black: '#484F58',
            red: '#FF7B72',
            green: '#3FB950',
            yellow: '#D29922',
            blue: '#58A6FF',
            magenta: '#BC8CFF',
            cyan: '#39C5CF',
            white: '#B1BAC4',
          },
          scrollback: 10000,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.loadAddon(webLinksAddon);

        term.open(containerRef.current);
        try {
          fitAddon.fit();
        } catch {
          // ignore layout fit error in hidden / zero-dimension container
        }

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        // Write initial banner and logs
        term.writeln(
          '\x1b[1;34m[Quant CI Runner]\x1b[0m Connecting to build stream \x1b[33m#' +
            buildId +
            '\x1b[0m...',
        );
        for (const line of initialLogs) {
          term.writeln(line);
        }

        // Window resize handler
        const handleResize = () => {
          try {
            fitAddon.fit();
          } catch {
            // ignore
          }
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          term.dispose();
        };
      } catch (err) {
        // Fallback for headless/unsupported environments
        console.warn('xterm initialization fallback:', err);
      }
    }

    const cleanupPromise = initTerminal();

    return () => {
      isMounted = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [buildId]);

  // Connect to SSE stream
  useEffect(() => {
    if (!autoConnect) return;

    const url = streamUrl ?? `/api/ci/builds/${buildId}/logs`;

    try {
      if (typeof EventSource !== 'undefined') {
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
          setStatus('live');
          if (terminalRef.current) {
            terminalRef.current.writeln('\x1b[32m✔ Connected to live log stream.\x1b[0m');
          }
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const line = data.line ?? data.message ?? event.data;
            if (terminalRef.current) {
              terminalRef.current.writeln(line);
              if (autoScroll) {
                terminalRef.current.scrollToBottom();
              }
            }
            setLogBuffer((prev) => [...prev, line]);

            if (data.isEnd || data.status === 'completed') {
              setStatus('completed');
              if (terminalRef.current) {
                terminalRef.current.writeln(
                  '\x1b[32m[CI] Build finished with status: SUCCESS\x1b[0m',
                );
              }
              es.close();
            } else if (data.status === 'failed') {
              setStatus('failed');
              if (terminalRef.current) {
                terminalRef.current.writeln(
                  '\x1b[31m[CI] Build finished with status: FAILED\x1b[0m',
                );
              }
              es.close();
            }
          } catch {
            if (terminalRef.current) {
              terminalRef.current.writeln(event.data);
            }
            setLogBuffer((prev) => [...prev, event.data]);
          }
        };

        es.onerror = () => {
          setStatus('disconnected');
          if (terminalRef.current) {
            terminalRef.current.writeln(
              '\x1b[33m⚠ Stream disconnected. Waiting for updates...\x1b[0m',
            );
          }
          es.close();
        };

        return () => {
          es.close();
        };
      }
    } catch {
      setStatus('disconnected');
    }
  }, [buildId, streamUrl, autoConnect, autoScroll]);

  const handleClear = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
    }
    setLogBuffer([]);
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = logBuffer.join('\n');
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [logBuffer]);

  const handleSearchNext = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery);
    }
  }, [searchQuery]);

  const handleSearchPrev = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  }, [searchQuery]);

  const getStatusBadge = () => {
    switch (status) {
      case 'live':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
            LIVE
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40">
            ✓ COMPLETED
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
            ✕ FAILED
          </span>
        );
      case 'connecting':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#D29922]/20 text-[#D29922] border border-[#D29922]/40">
            CONNECTING...
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#30363D] text-[#7D8590]">
            DISCONNECTED
          </span>
        );
    }
  };

  return (
    <div
      data-testid="build-terminal"
      className={`flex flex-col bg-[#0D1117] border border-[#30363D] rounded-xl overflow-hidden shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-4 z-50' : 'w-full h-full min-h-[300px]'
      }`}
      style={{ height: isFullscreen ? 'calc(100vh - 32px)' : (height ?? undefined) }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D] select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="font-mono text-xs text-white font-semibold flex items-center gap-2">
            <span>Terminal: {runName ?? `Build #${buildId}`}</span>
            {getStatusBadge()}
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 text-xs">
          {/* Search Bar */}
          <div className="flex items-center bg-[#0D1117] border border-[#30363D] rounded px-1.5 py-0.5">
            <input
              data-testid="search-input"
              type="text"
              placeholder="Find in logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchNext()}
              className="bg-transparent text-white text-[11px] outline-none w-24 sm:w-36 placeholder:text-[#7D8590]"
            />
            <button
              type="button"
              onClick={handleSearchPrev}
              title="Previous Match"
              className="text-[#7D8590] hover:text-white px-1"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={handleSearchNext}
              title="Next Match"
              className="text-[#7D8590] hover:text-white px-1"
            >
              ▼
            </button>
          </div>

          {/* Auto-scroll toggle */}
          <button
            type="button"
            data-testid="autoscroll-toggle"
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
              autoScroll
                ? 'bg-[#1F6FEB]/20 border-[#58A6FF]/40 text-[#58A6FF]'
                : 'bg-[#21262D] border-[#30363D] text-[#7D8590]'
            }`}
            title="Toggle Auto-Scroll"
          >
            {autoScroll ? 'Scroll: ON' : 'Scroll: PAUSED'}
          </button>

          {/* Copy Logs */}
          <button
            type="button"
            data-testid="copy-btn"
            onClick={handleCopyAll}
            className="px-2 py-1 rounded text-[11px] font-semibold bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] border border-[#30363D] transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            data-testid="clear-btn"
            onClick={handleClear}
            className="px-2 py-1 rounded text-[11px] font-semibold bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] border border-[#30363D] transition-colors"
          >
            Clear
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="px-2 py-1 rounded text-[11px] bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] border border-[#30363D]"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '⤢' : '⤡'}
          </button>

          {/* Close button if provided */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#7D8590] hover:text-white p-1"
              title="Close Terminal"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Terminal Canvas Container */}
      <div
        ref={containerRef}
        data-testid="terminal-container"
        className="flex-1 p-2 bg-[#0D1117] min-h-[300px] overflow-hidden"
      >
        {/* Headless fallback buffer rendered when xterm DOM canvas is unmounted */}
        <noscript>
          <div className="font-mono text-xs text-[#7D8590] whitespace-pre-wrap p-2">
            {logBuffer.join('\n')}
          </div>
        </noscript>
      </div>

      {/* Hidden/accessible log buffer for testing and screen readers */}
      <div data-testid="terminal-buffer" className="sr-only" aria-live="polite">
        {logBuffer.join('\n')}
      </div>
    </div>
  );
}
