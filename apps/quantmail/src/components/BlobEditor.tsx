'use client';

import { type KeyboardEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react';

export type BlobEditorTheme = 'github-dark' | 'github-light';

export type CommitBlobInput = {
  path: string;
  branch: string;
  content: string;
  message: string;
  expectedBlobSha: string;
  originalPath?: string;
  isDelete?: boolean;
  newBranch?: string;
};

export type BlobEditorProps = {
  path: string;
  branch: string;
  availableBranches?: string[];
  initialContent: string;
  expectedBlobSha: string;
  language?: string;
  readOnly?: boolean;
  onClose: () => void;
  onCommit: (input: CommitBlobInput) => Promise<void>;
};

const THEMES: Record<
  BlobEditorTheme,
  {
    shell: string;
    header: string;
    editor: string;
    gutter: string;
    text: string;
    muted: string;
    border: string;
    input: string;
  }
> = {
  'github-dark': {
    shell: 'bg-[#0d1117] text-[#e6edf3]',
    header: 'bg-[#161b22]',
    editor: 'bg-[#0d1117]',
    gutter: 'bg-[#0d1117] text-[#484f58]',
    text: 'text-[#e6edf3]',
    muted: 'text-[#7d8590]',
    border: 'border-[#30363d]',
    input: 'bg-[#0d1117] text-[#e6edf3]',
  },
  'github-light': {
    shell: 'bg-white text-[#1f2328]',
    header: 'bg-[#f6f8fa]',
    editor: 'bg-white',
    gutter: 'bg-[#f6f8fa] text-[#8c959f]',
    text: 'text-[#1f2328]',
    muted: 'text-[#656d76]',
    border: 'border-[#d0d7de]',
    input: 'bg-white text-[#1f2328]',
  },
};

function languageFromPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    md: 'Markdown',
    py: 'Python',
    java: 'Java',
    kt: 'Kotlin',
    kts: 'Kotlin',
    rs: 'Rust',
    go: 'Go',
    sh: 'Shell',
    bash: 'Shell',
    yml: 'YAML',
    yaml: 'YAML',
    sql: 'SQL',
    prisma: 'Prisma',
  };

  return extension ? (languageMap[extension] ?? extension.toUpperCase()) : 'Text';
}

export function BlobEditor({
  path,
  branch,
  availableBranches = [],
  initialContent,
  expectedBlobSha,
  language,
  readOnly = false,
  onClose,
  onCommit,
}: BlobEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${path}`);
  const [targetBranch, setTargetBranch] = useState(branch);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [theme, setTheme] = useState<BlobEditorTheme>('github-dark');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  const themeTokens = THEMES[theme];
  const lines = useMemo(() => content.split('\n'), [content]);
  const dirty = content !== initialContent || targetBranch !== branch;
  const displayLanguage = language || languageFromPath(path);

  useEffect(() => {
    setContent(initialContent);
    setCommitMessage(`Update ${path}`);
    setTargetBranch(branch);
    setMode('edit');
    setError(null);
  }, [branch, initialContent, path]);

  const handleEditorScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const handlePreviewScroll = (event: UIEvent<HTMLPreElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();

    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = `${content.slice(0, start)}  ${content.slice(end)}`;

    setContent(updated);

    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  };

  const requestClose = () => {
    if (dirty && !window.confirm('Discard your uncommitted file changes?')) {
      return;
    }

    onClose();
  };

  const submit = async () => {
    if (saving || readOnly || !dirty || !commitMessage.trim() || !targetBranch.trim()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onCommit({
        path,
        branch: targetBranch.trim(),
        content,
        message: commitMessage.trim(),
        expectedBlobSha,
      });
    } catch (commitError) {
      setError(
        commitError instanceof Error ? commitError.message : 'The file could not be committed.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blob-editor-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3 sm:p-5"
    >
      <section
        className={`flex max-h-[94dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border shadow-2xl ${themeTokens.shell} ${themeTokens.border}`}
      >
        <header
          className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${themeTokens.header} ${themeTokens.border}`}
        >
          <div className="min-w-0">
            <h2
              id="blob-editor-title"
              className="truncate font-mono text-sm font-semibold"
              title={path}
            >
              {path}
            </h2>

            <div
              className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] ${themeTokens.muted}`}
            >
              <span>{displayLanguage}</span>
              <span aria-hidden="true">·</span>
              <span>{lines.length} lines</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{expectedBlobSha.slice(0, 12)}</span>

              {dirty && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#d29922]">Unsaved changes</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex overflow-hidden rounded-md border ${themeTokens.border}`}
              role="group"
              aria-label="Editor mode"
            >
              <button
                type="button"
                onClick={() => setMode('edit')}
                aria-pressed={mode === 'edit'}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  mode === 'edit'
                    ? 'bg-[#238636] text-white'
                    : `${themeTokens.header} ${themeTokens.muted}`
                }`}
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => setMode('preview')}
                aria-pressed={mode === 'preview'}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  mode === 'preview'
                    ? 'bg-[#238636] text-white'
                    : `${themeTokens.header} ${themeTokens.muted}`
                }`}
              >
                Preview
              </button>
            </div>

            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value as BlobEditorTheme)}
              aria-label="Syntax theme"
              className={`rounded-md border px-2.5 py-1.5 text-xs outline-none focus:border-[#58a6ff] ${themeTokens.input} ${themeTokens.border}`}
            >
              <option value="github-dark">GitHub Dark</option>
              <option value="github-light">GitHub Light</option>
            </select>

            <button
              type="button"
              onClick={requestClose}
              aria-label="Close blob editor"
              className={`rounded-md p-2 transition-colors hover:bg-black/10 ${themeTokens.muted}`}
            >
              ✕
            </button>
          </div>
        </header>

        <div
          className={`grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] overflow-hidden font-mono text-[13px] leading-6 ${themeTokens.editor}`}
        >
          <pre
            ref={gutterRef}
            aria-hidden="true"
            className={`m-0 overflow-hidden border-r px-3 py-4 text-right select-none ${themeTokens.gutter} ${themeTokens.border}`}
          >
            {lines.map((_, index) => (
              <span key={index} className="block h-6">
                {index + 1}
              </span>
            ))}
          </pre>

          {mode === 'edit' ? (
            <textarea
              ref={textareaRef}
              aria-label={`Edit ${path}`}
              value={content}
              readOnly={readOnly}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              onScroll={handleEditorScroll}
              spellCheck={false}
              wrap="off"
              className={`m-0 min-h-[52dvh] w-full resize-none overflow-auto border-0 p-4 font-mono text-[13px] leading-6 outline-none ${themeTokens.editor} ${themeTokens.text}`}
            />
          ) : (
            <pre
              ref={previewRef}
              tabIndex={0}
              onScroll={handlePreviewScroll}
              className={`m-0 min-h-[52dvh] overflow-auto whitespace-pre p-4 font-mono text-[13px] leading-6 ${themeTokens.editor} ${themeTokens.text}`}
            >
              <code>{content || ' '}</code>
            </pre>
          )}
        </div>

        <footer
          className={`shrink-0 space-y-3 border-t p-4 ${themeTokens.header} ${themeTokens.border}`}
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Commit message</span>

              <input
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                maxLength={200}
                disabled={saving || readOnly}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#58a6ff] disabled:opacity-60 ${themeTokens.input} ${themeTokens.border}`}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Target branch</span>

              {availableBranches.length > 0 ? (
                <select
                  value={targetBranch}
                  onChange={(event) => setTargetBranch(event.target.value)}
                  disabled={saving || readOnly}
                  className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#58a6ff] disabled:opacity-60 ${themeTokens.input} ${themeTokens.border}`}
                >
                  {Array.from(new Set([branch, ...availableBranches])).map((branchName) => (
                    <option key={branchName} value={branchName}>
                      {branchName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={targetBranch}
                  onChange={(event) => setTargetBranch(event.target.value)}
                  disabled={saving || readOnly}
                  className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#58a6ff] disabled:opacity-60 ${themeTokens.input} ${themeTokens.border}`}
                />
              )}
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-[#f85149]/40 bg-[#f85149]/10 px-3 py-2 text-xs text-[#f85149]"
            >
              {error}
            </p>
          )}

          {readOnly && (
            <p className="text-xs text-[#d29922]">
              This file is read-only for the current account.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-[11px] ${themeTokens.muted}`}>
              The expected blob SHA is checked to prevent overwriting a newer revision.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${themeTokens.border}`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={
                  saving || readOnly || !dirty || !commitMessage.trim() || !targetBranch.trim()
                }
                className="rounded-md bg-[#238636] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Committing…' : 'Commit changes'}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
