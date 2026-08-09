'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../../../components/AppShell';
import { AppSidebar } from '../../../../components/AppSidebar';
import { FileTree } from '../../../../components/FileTree';
import { AICodingChat } from '../../../../components/AICodingChat';
import { useRepo, useFileTree, useFileContent } from '../../../../hooks/useRepos';

export default function RepoEditorPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = (params?.id as string) || '';
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [isModified, setIsModified] = useState(false);
  const [showAIChat, setShowAIChat] = useState(true);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const { data: repo } = useRepo(repoId);
  const { data: fileTree, isLoading: loadingTree } = useFileTree(repoId);
  const { data: fileContent } = useFileContent(repoId, selectedFile);

  // Load file content when selected
  useEffect(() => {
    if (fileContent?.content) {
      setEditorContent(fileContent.content);
      setIsModified(false);
    }
  }, [fileContent]);

  const handleFileSelect = useCallback((path: string) => {
    if (isModified) {
      if (!confirm('You have unsaved changes. Discard?')) return;
    }
    setSelectedFile(path);
  }, [isModified]);

  const handleEditorChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value);
    setIsModified(true);
  }, []);

  const handleSave = useCallback(() => {
    // In production: POST to backend to save file
    setIsModified(false);
    setTerminalOutput((prev) => [...prev, `✓ Saved ${selectedFile}`]);
  }, [selectedFile]);

  const handleTerminalSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    setTerminalOutput((prev) => [...prev, `$ ${terminalInput}`, 'Command execution not connected yet.']);
    setTerminalInput('');
  }, [terminalInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = editorContent.substring(0, start) + '  ' + editorContent.substring(end);
      setEditorContent(newContent);
      setIsModified(true);
      // Move cursor
      setTimeout(() => { target.selectionStart = target.selectionEnd = start + 2; }, 0);
    }
    // Ctrl+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [editorContent, handleSave]);

  const getLanguage = (filename: string | null): string => {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      yaml: 'yaml', yml: 'yaml', sh: 'bash',
    };
    return map[ext] || 'plaintext';
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="code-ide">
        {/* Top bar */}
        <header className="ide-topbar">
          <div className="ide-topbar-left">
            <Button variant="secondary" onClick={() => router.push(`/repos/${repoId}`)}>
              ← Back
            </Button>
            <span className="ide-repo-name">{repo?.name || 'Repository'}</span>
            {selectedFile && (
              <span className="ide-file-path">
                / {selectedFile} {isModified && <span className="ide-modified">●</span>}
              </span>
            )}
          </div>
          <div className="ide-topbar-right">
            <button
              type="button"
              className={`ide-toggle-btn ${showAIChat ? 'is-active' : ''}`}
              onClick={() => setShowAIChat((v) => !v)}
              title="Toggle AI Assistant"
            >
              ✦ AI
            </button>
            <button
              type="button"
              className={`ide-toggle-btn ${showTerminal ? 'is-active' : ''}`}
              onClick={() => setShowTerminal((v) => !v)}
              title="Toggle Terminal"
            >
              ⌨ Terminal
            </button>
            <Button variant="primary" onClick={handleSave} disabled={!isModified}>
              {isModified ? 'Save' : 'Saved'}
            </Button>
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
                <h2>Select a file to start editing</h2>
                <p>Choose a file from the tree on the left, or use AI to generate code.</p>
                <div className="ide-welcome-shortcuts">
                  <kbd>Ctrl+S</kbd> Save
                  <kbd>Tab</kbd> Indent
                  <kbd>✦ AI</kbd> Ask AI
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
                    ref={editorRef}
                    className="ide-textarea"
                    value={editorContent}
                    onChange={handleEditorChange}
                    onKeyDown={handleKeyDown}
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
                  {isModified && <span className="ide-status-modified">Modified</span>}
                </div>
              </div>
            )}

            {/* Terminal */}
            <AnimatePresence>
              {showTerminal && (
                <motion.div
                  className="ide-terminal"
                  initial={{ height: 0 }}
                  animate={{ height: 200 }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="ide-terminal-header">
                    <span>Terminal</span>
                    <button type="button" onClick={() => setShowTerminal(false)}>×</button>
                  </div>
                  <div className="ide-terminal-output">
                    {terminalOutput.map((line, i) => (
                      <pre key={i}>{line}</pre>
                    ))}
                  </div>
                  <form className="ide-terminal-input" onSubmit={handleTerminalSubmit}>
                    <span className="ide-prompt">$</span>
                    <input
                      type="text"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      placeholder="Type a command..."
                      autoFocus
                    />
                  </form>
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
                  onApplyCode={(code) => {
                    setEditorContent(code);
                    setIsModified(true);
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
