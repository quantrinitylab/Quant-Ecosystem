// ============================================================================
// QuantMail - Code Editor Component
// Code editor component for repository file viewing
// ============================================================================

import React, { useState, useMemo } from 'react';
import { SyntaxHighlighter } from './SyntaxHighlighter';
import { IconFile } from './icons';

export interface CodeEditorProps {
  filename: string;
  content: string;
  language?: string;
  readOnly?: boolean;
  lineNumbers?: boolean;
  onSave?: (content: string) => void;
  onChange?: (content: string) => void;
  highlightedLines?: number[];
  diff?: { additions: number[]; deletions: number[] };
}

const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  sql: 'sql',
  dockerfile: 'dockerfile',
};

export function CodeEditor(props: CodeEditorProps): React.ReactElement {
  const {
    filename,
    content,
    language,
    readOnly = true,
    lineNumbers = true,
    onSave,
    onChange,
    highlightedLines = [],
    diff,
  } = props;

  const [editedContent, setEditedContent] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);

  const detectedLanguage = useMemo(() => {
    if (language) return language;
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return languageMap[ext] || 'plaintext';
  }, [filename, language]);

  const lines = useMemo(
    () => (isEditing ? editedContent : content).split('\n'),
    [content, editedContent, isEditing],
  );
  const lineCount = lines.length;

  const handleChange = (newContent: string) => {
    setEditedContent(newContent);
    onChange?.(newContent);
  };

  const handleSave = () => {
    onSave?.(editedContent);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select all text
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = editedContent.substring(0, start) + '  ' + editedContent.substring(end);
      handleChange(newContent);
    }
  };

  const getLineClass = (lineNum: number): string => {
    const classes: string[] = ['code-line'];
    if (highlightedLines.includes(lineNum)) classes.push('highlighted');
    if (diff?.additions.includes(lineNum)) classes.push('diff-addition');
    if (diff?.deletions.includes(lineNum)) classes.push('diff-deletion');
    return classes.join(' ');
  };

  return (
    <div className="code-editor">
      {/* File header */}
      <div className="editor-header">
        <div className="file-info">
          <span className="file-icon inline-flex">
            <IconFile size={13} />
          </span>
          <span className="file-name">{filename}</span>
          <span className="file-language">{detectedLanguage}</span>
          <span className="file-lines">{lineCount} lines</span>
        </div>
        <div className="editor-actions">
          <button className="btn btn-sm btn-icon" onClick={handleCopy} title="Copy content">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className={`btn btn-sm btn-icon ${wrapLines ? 'active' : ''}`}
            onClick={() => setWrapLines(!wrapLines)}
            title="Toggle word wrap"
          >
            Wrap
          </button>
          {!readOnly && (
            <>
              {isEditing ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={handleSave}>
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditedContent(content);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor body */}
      <div className={`editor-body ${wrapLines ? 'wrap' : ''}`}>
        {isEditing ? (
          <div className="editor-edit-mode">
            {lineNumbers && (
              <div className="line-numbers">
                {lines.map((_, i) => (
                  <span key={i + 1} className="line-number">
                    {i + 1}
                  </span>
                ))}
              </div>
            )}
            <textarea
              className="editor-textarea"
              value={editedContent}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
          </div>
        ) : (
          <SyntaxHighlighter
            code={content}
            language={detectedLanguage}
            lineNumbers={lineNumbers}
            highlightedLines={highlightedLines}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="editor-statusbar">
        <span>{detectedLanguage}</span>
        <span>{lineCount} lines</span>
        <span>{content.length} characters</span>
        {isEditing && <span className="editing-indicator">Editing</span>}
      </div>
    </div>
  );
}

export default CodeEditor;
