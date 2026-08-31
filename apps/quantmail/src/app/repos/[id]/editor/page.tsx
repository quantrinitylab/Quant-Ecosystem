'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../../../components/AppShell';
import { AppSidebar } from '../../../../components/AppSidebar';
import { FileTree } from '../../../../components/FileTree';
import { AICodingChat } from '../../../../components/AICodingChat';
import { IconChevronLeft, IconSparkle, IconTerminal, IconX } from '../../../../components/icons';
import { useRepo, useFileTree, useFileContent } from '../../../../hooks/useRepos';

export default function RepoEditorPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = (params?.id as string) || '';
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [showAIChat, setShowAIChat] = useState(true);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [showOutput, setShowOutput] = useState(false);

  const { data: repo } = useRepo(repoId);
  const { data: fileTree, isLoading: loadingTree } = useFileTree(repoId);
  const { data: fileContent } = useFileContent(repoId, selectedFile);

  // Load file content when selected
  useEffect(() => {
    if (fileContent) {
      setEditorContent(fileContent.content);
    }
  }, [fileContent]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  // There is no Save control any more. `PATCH /repos/:id/file` does not exist and
  // `GET /repos/:id/file` returns `content: ''` unconditionally, so a Save button
  // could only ever have logged its own failure — which is what it did. The
  // read-only state is now stated once, as a pill, instead of being offered as an
  // action that declines itself.
  //
  // The panel below is an output log, not a terminal: it never had command
  // execution behind it, so the `$` prompt that used to sit there could only
  // print "Terminal unavailable" for anything typed into it. It is now write-only
  // from the app's side.
  const appendOutput = useCallback((line: string) => {
    setOutputLines((prev) => [...prev, line]);
    setShowOutput(true);
  }, []);

  const getLanguage = (filename: string | null): string => {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      rb: 'ruby',
      css: 'css',
      html: 'html',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'bash',
    };
    return map[ext] || 'plaintext';
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="code-ide">
        {/* Top bar */}
        <header className="ide-topbar">
          <div className="ide-topbar-left">
            <button
              type="button"
              onClick={() => router.push(`/repos/${repoId}`)}
              className="ide-back-btn"
            >
              <IconChevronLeft size={14} />
              <span>Back</span>
            </button>
            <span className="ide-repo-name">{repo?.name || 'Repository'}</span>
            {selectedFile && <span className="ide-file-path">/ {selectedFile}</span>}
          </div>
          <div className="ide-topbar-right">
            <button
              type="button"
              className={`ide-toggle-btn ${showAIChat ? 'is-active' : ''}`}
              onClick={() => setShowAIChat((v) => !v)}
              aria-pressed={showAIChat}
              title="Toggle AI assistant"
            >
              <IconSparkle size={14} />
              <span>AI</span>
            </button>
            <button
              type="button"
              className={`ide-toggle-btn ${showOutput ? 'is-active' : ''}`}
              onClick={() => setShowOutput((v) => !v)}
              aria-pressed={showOutput}
              title="Toggle output log"
            >
              <IconTerminal size={14} />
              <span>Output</span>
            </button>
            <span className="ide-readonly-pill" title="This repository is served read-only">
              Read only
            </span>
          </div>
        </header>

        {/* Main content */}
        <div className="ide-body">
          {/* File tree sidebar */}
          <aside className="ide-sidebar">
            {loadingTree ? (
              <div className="p-3">
                <Skeleton variant="rect" width="100%" height="200px" />
              </div>
            ) : fileTree && fileTree.length > 0 ? (
              <FileTree
                paths={fileTree}
                selectedFile={selectedFile}
                onSelectFile={handleFileSelect}
              />
            ) : (
              <p className="ide-empty-tree">No files</p>
            )}
          </aside>

          {/* Editor area */}
          <main className="ide-editor-area">
            {!selectedFile ? (
              <div className="ide-welcome">
                <h2>Select a file to preview</h2>
                <p>
                  Repository storage is not connected, so editing, saving, AI apply, and terminal
                  execution are unavailable.
                </p>
                <div className="ide-welcome-shortcuts">
                  <span className="ide-welcome-fact">
                    <span>Read only</span> No durable writes
                  </span>
                  <span className="ide-welcome-fact">
                    <IconSparkle size={13} />
                    <span>AI</span> Suggestions only
                  </span>
                </div>
              </div>
            ) : (
              <div className="ide-editor-wrapper">
                {/* Line numbers + editor */}
                <div className="ide-editor-with-lines">
                  <div className="ide-line-numbers">
                    {editorContent.split('\n').map((_, i) => (
                      <span key={i}>{i + 1}</span>
                    ))}
                  </div>
                  <textarea
                    className="ide-textarea"
                    value={editorContent}
                    readOnly
                    aria-label="Repository file preview (read only)"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                </div>

                {/* Status bar */}
                <div className="ide-statusbar">
                  <span>{getLanguage(selectedFile)}</span>
                  <span>{editorContent.split('\n').length} lines</span>
                  <span>{editorContent.length} chars</span>
                  <span>UTF-8</span>
                  <span>Read only</span>
                </div>
              </div>
            )}

            {/* Output log — write-only; nothing here executes commands */}
            <AnimatePresence>
              {showOutput && (
                <motion.div
                  className="ide-terminal"
                  initial={{ height: 0 }}
                  animate={{ height: 200 }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="ide-terminal-header">
                    <span>Output</span>
                    <button
                      type="button"
                      onClick={() => setShowOutput(false)}
                      aria-label="Close output log"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                  <div className="ide-terminal-output" role="log" aria-live="polite">
                    {outputLines.length === 0 ? (
                      <pre className="ide-terminal-hint">
                        Nothing to report yet. Command execution is not connected, so this panel
                        only shows what the editor itself has to say.
                      </pre>
                    ) : (
                      outputLines.map((line, i) => <pre key={i}>{line}</pre>)
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* AI Chat Panel */}
          <AnimatePresence>
            {showAIChat && (
              <motion.aside
                className="ide-ai-panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 360, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AICodingChat
                  currentFile={selectedFile}
                  currentContent={editorContent}
                  language={getLanguage(selectedFile)}
                  onApplyCode={() => {
                    appendOutput(
                      'AI apply unavailable: durable repository storage is not connected.',
                    );
                  }}
                  onClose={() => setShowAIChat(false)}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AppShell>
  );
}
