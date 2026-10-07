'use client';

// ============================================================================
// QuantAI - CanvasArtifactsPanel Component (Claude Artifacts + Codex Canvas)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import CodeEditor from './CodeEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { CanvasArtifact } from '../types/agent-mode';

interface CanvasArtifactsPanelProps {
  artifact: CanvasArtifact | null;
  onClose: () => void;
  onUpdateArtifact?: (updated: CanvasArtifact) => void;
}

type CanvasTab = 'preview' | 'code' | 'markdown';
type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

export function CanvasArtifactsPanel({
  artifact,
  onClose,
  onUpdateArtifact,
}: CanvasArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState<CanvasTab>('preview');
  const [code, setCode] = useState(artifact?.code || '');
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (artifact?.code) {
      setCode(artifact.code);
    }
  }, [artifact?.code]);

  const handleCopy = useCallback(async () => {
    try {
      const textToCopy = activeTab === 'markdown' ? artifact?.markdown || code : code;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [activeTab, artifact?.markdown, code]);

  const handleApplyChanges = useCallback(() => {
    if (!artifact) return;
    const updated: CanvasArtifact = {
      ...artifact,
      code,
      previewHtml: artifact.previewHtml
        ? artifact.previewHtml.replace(
            /<div id="custom-code">[\s\S]*?<\/div>/,
            `<div id="custom-code">${code}</div>`,
          )
        : undefined,
    };
    onUpdateArtifact?.(updated);
    setApplied(true);
    setIframeKey((k) => k + 1);
    setTimeout(() => setApplied(false), 2000);
  }, [artifact, code, onUpdateArtifact]);

  if (!artifact) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[var(--quant-surface)] border-l border-[var(--quant-border)]">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl mb-3">
          🎨
        </div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">No Artifact Selected</h3>
        <p className="text-xs text-[var(--foreground-secondary)] max-w-xs mt-1">
          Generate code or an interactive component in Chat or Agent Mode to inspect it live here.
        </p>
      </div>
    );
  }

  const previewDoc =
    artifact.previewHtml ||
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 p-6 font-sans">
  <div class="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-center max-w-sm mx-auto">
    <div class="text-2xl mb-2">⚡</div>
    <h3 class="font-bold text-sm text-emerald-400">${artifact.title}</h3>
    <pre class="mt-3 p-3 bg-zinc-950 rounded text-left text-xs font-mono text-zinc-300 overflow-x-auto">${artifact.code.substring(0, 300)}</pre>
  </div>
</body>
</html>`;

  return (
    <div className="w-full h-full flex flex-col bg-[var(--quant-surface)] border-l border-[var(--quant-border)] overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">🎨</span>
          <span className="text-xs font-semibold text-[var(--foreground)] truncate max-w-[180px]">
            {artifact.title}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-[var(--quant-surface-hover)] border border-[var(--quant-border)] text-[var(--foreground-secondary)]">
            {artifact.language}
          </span>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[var(--quant-surface-hover)] p-1 rounded-lg border border-[var(--quant-border)]">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-[var(--quant-accent)] text-white shadow-sm'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            👁️ Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'code'
                ? 'bg-[var(--quant-accent)] text-white shadow-sm'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            💻 Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('markdown')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'markdown'
                ? 'bg-[var(--quant-accent)] text-white shadow-sm'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            📝 Markdown
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy content"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] text-xs text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <span>{copied ? '✓' : '⧉'}</span>
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {activeTab === 'code' && (
            <button
              type="button"
              onClick={handleApplyChanges}
              title="Apply Code Changes"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <span>{applied ? '✓ Applied' : 'Apply Changes'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Canvas"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Tab 1: Live Interactive Preview */}
        {activeTab === 'preview' && (
          <div className="w-full h-full flex flex-col bg-zinc-950">
            {/* Viewport Toolbar */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px] text-zinc-400">
              <div className="flex items-center gap-2">
                <span>Viewport:</span>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    previewDevice === 'desktop'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'hover:text-zinc-200'
                  }`}
                >
                  🖥 Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('tablet')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    previewDevice === 'tablet'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'hover:text-zinc-200'
                  }`}
                >
                  📱 Tablet (768px)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    previewDevice === 'mobile'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'hover:text-zinc-200'
                  }`}
                >
                  📱 Mobile (375px)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIframeKey((k) => k + 1)}
                className="hover:text-zinc-200 transition-colors flex items-center gap-1"
                title="Reload Preview"
              >
                ↻ Reload
              </button>
            </div>

            {/* Sandboxed iframe container */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-zinc-950">
              <iframe
                key={iframeKey}
                title="Artifact Live Preview"
                srcDoc={previewDoc}
                sandbox="allow-scripts allow-modals"
                className={`h-full border border-zinc-800 rounded-xl bg-white shadow-2xl transition-all ${
                  previewDevice === 'desktop'
                    ? 'w-full'
                    : previewDevice === 'tablet'
                      ? 'w-[768px]'
                      : 'w-[375px]'
                }`}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Syntax-highlighted CodeEditor */}
        {activeTab === 'code' && (
          <div className="w-full h-full flex flex-col overflow-auto bg-[#1e1e1e]">
            <CodeEditor
              code={code}
              language={artifact.language || 'typescript'}
              onChange={setCode}
              showLineNumbers
              theme="dark"
            />
          </div>
        )}

        {/* Tab 3: Rich Markdown Docs */}
        {activeTab === 'markdown' && (
          <div className="w-full h-full p-6 overflow-y-auto bg-[var(--quant-surface)]">
            <MarkdownRenderer
              content={
                artifact.markdown ||
                `# ${artifact.title}\n\n\`\`\`${artifact.language}\n${code}\n\`\`\``
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default CanvasArtifactsPanel;
