'use client';

import React, { useState, useMemo } from 'react';
import type { Repo, FileNode } from '../types';
import { RepoSidebarMetadata } from './RepoSidebarMetadata';
import { BranchSelectorModal } from './BranchSelectorModal';
import { CloneCodespacesMenu } from './CloneCodespacesMenu';
import { MarkdownPreview } from './MarkdownPreview';

export type CommitBlobInput = {
  path: string;
  branch: string;
  content: string;
  message: string;
  expectedBlobSha: string;
  originalPath?: string;
  isDelete?: boolean;
};

export type TokenType =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'boolean'
  | 'plain';

export interface CodeToken {
  type: TokenType;
  text: string;
}

export function detectLanguage(pathOrName: string): string {
  const ext = pathOrName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'sql':
      return 'sql';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'sh':
      return 'shell';
    default:
      return 'plaintext';
  }
}

export function tokenizeLine(line: string, language: string): CodeToken[] {
  if (!line) return [{ type: 'plain', text: '' }];

  const tokens: CodeToken[] = [];
  let i = 0;
  const len = line.length;

  const isCommentStart = (idx: number): boolean => {
    if (
      (language === 'typescript' ||
        language === 'javascript' ||
        language === 'rust' ||
        language === 'go') &&
      line.startsWith('//', idx)
    )
      return true;
    if ((language === 'python' || language === 'shell') && line[idx] === '#') return true;
    if (language === 'sql' && line.startsWith('--', idx)) return true;
    return false;
  };

  const getKeywords = (lang: string): Set<string> => {
    switch (lang) {
      case 'typescript':
      case 'javascript':
        return new Set([
          'const',
          'let',
          'var',
          'function',
          'return',
          'if',
          'else',
          'for',
          'while',
          'do',
          'switch',
          'case',
          'default',
          'break',
          'continue',
          'import',
          'export',
          'from',
          'class',
          'interface',
          'type',
          'extends',
          'implements',
          'new',
          'this',
          'super',
          'typeof',
          'instanceof',
          'void',
          'delete',
          'try',
          'catch',
          'finally',
          'throw',
          'async',
          'await',
          'yield',
          'in',
          'of',
          'as',
        ]);
      case 'python':
        return new Set([
          'def',
          'class',
          'return',
          'if',
          'elif',
          'else',
          'for',
          'while',
          'try',
          'except',
          'finally',
          'with',
          'as',
          'import',
          'from',
          'in',
          'is',
          'not',
          'and',
          'or',
          'lambda',
          'pass',
          'yield',
          'raise',
          'async',
          'await',
          'global',
          'nonlocal',
          'assert',
          'del',
        ]);
      case 'sql':
        return new Set([
          'select',
          'from',
          'where',
          'insert',
          'into',
          'update',
          'delete',
          'join',
          'left',
          'right',
          'inner',
          'outer',
          'full',
          'on',
          'group',
          'by',
          'order',
          'having',
          'limit',
          'offset',
          'create',
          'table',
          'drop',
          'alter',
          'index',
          'view',
          'and',
          'or',
          'not',
          'in',
          'is',
          'as',
          'union',
          'all',
          'set',
          'values',
          'primary',
          'key',
          'foreign',
          'references',
          'distinct',
          'case',
          'when',
          'then',
          'end',
          'else',
          'asc',
          'desc',
          'between',
          'like',
          'exists',
          'default',
        ]);
      case 'rust':
        return new Set([
          'fn',
          'let',
          'mut',
          'const',
          'pub',
          'struct',
          'enum',
          'impl',
          'trait',
          'use',
          'mod',
          'match',
          'if',
          'else',
          'loop',
          'while',
          'for',
          'in',
          'return',
          'async',
          'await',
          'where',
          'type',
          'self',
          'Self',
          'move',
          'unsafe',
          'ref',
          'crate',
        ]);
      case 'go':
        return new Set([
          'func',
          'package',
          'import',
          'var',
          'const',
          'type',
          'struct',
          'interface',
          'return',
          'if',
          'else',
          'for',
          'range',
          'switch',
          'case',
          'default',
          'select',
          'go',
          'defer',
          'chan',
          'map',
          'break',
          'continue',
          'fallthrough',
        ]);
      case 'shell':
        return new Set([
          'if',
          'then',
          'else',
          'elif',
          'fi',
          'for',
          'in',
          'do',
          'done',
          'while',
          'until',
          'case',
          'esac',
          'function',
          'return',
          'exit',
          'echo',
          'export',
          'set',
          'local',
          'source',
        ]);
      default:
        return new Set();
    }
  };

  const keywords = getKeywords(language);
  const booleans = new Set([
    'true',
    'false',
    'null',
    'undefined',
    'None',
    'True',
    'False',
    'nil',
    'NULL',
  ]);

  while (i < len) {
    if (isCommentStart(i)) {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }

    const char = line[i];

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let str = quote;
      i++;
      while (i < len) {
        if (line[i] === '\\') {
          str += line[i];
          i++;
          if (i < len) {
            str += line[i];
            i++;
          }
        } else if (line[i] === quote) {
          str += line[i];
          i++;
          break;
        } else {
          str += line[i];
          i++;
        }
      }
      tokens.push({ type: 'string', text: str });
      continue;
    }

    if (/\d/.test(char) && (i === 0 || !/[a-zA-Z0-9_$]/.test(line[i - 1]))) {
      let num = '';
      while (i < len && /[0-9.xXa-fA-F_]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ type: 'number', text: num });
      continue;
    }

    if (/[a-zA-Z_$]/.test(char)) {
      let word = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(line[i])) {
        word += line[i];
        i++;
      }

      const lower = word.toLowerCase();
      if (keywords.has(language === 'sql' ? lower : word)) {
        tokens.push({ type: 'keyword', text: word });
      } else if (booleans.has(word)) {
        tokens.push({ type: 'boolean', text: word });
      } else {
        let nextIdx = i;
        while (nextIdx < len && /\s/.test(line[nextIdx])) nextIdx++;
        if (nextIdx < len && line[nextIdx] === '(') {
          tokens.push({ type: 'function', text: word });
        } else {
          tokens.push({ type: 'plain', text: word });
        }
      }
      continue;
    }

    tokens.push({ type: 'plain', text: char });
    i++;
  }

  return tokens;
}

export function renderSyntaxHighlightedLine(
  line: string,
  language: string,
  theme: 'github-dark' | 'github-light',
): React.ReactNode {
  const tokens = tokenizeLine(line, language);
  return tokens.map((token, i) => {
    let colorClass = '';
    if (theme === 'github-dark') {
      switch (token.type) {
        case 'keyword':
          colorClass = 'text-[#FF7B72] font-semibold';
          break;
        case 'string':
          colorClass = 'text-[#A5D6FF]';
          break;
        case 'number':
          colorClass = 'text-[#79C0FF]';
          break;
        case 'comment':
          colorClass = 'text-[#8B949E] italic';
          break;
        case 'function':
          colorClass = 'text-[#D2A8FF]';
          break;
        case 'boolean':
          colorClass = 'text-[#79C0FF] font-semibold';
          break;
        default:
          colorClass = 'text-[#E6EDF3]';
      }
    } else {
      switch (token.type) {
        case 'keyword':
          colorClass = 'text-[#CF222E] font-semibold';
          break;
        case 'string':
          colorClass = 'text-[#0A3069]';
          break;
        case 'number':
          colorClass = 'text-[#0550AE]';
          break;
        case 'comment':
          colorClass = 'text-[#6E7781] italic';
          break;
        case 'function':
          colorClass = 'text-[#8250DF]';
          break;
        case 'boolean':
          colorClass = 'text-[#0550AE] font-semibold';
          break;
        default:
          colorClass = 'text-[#1F2328]';
      }
    }

    return (
      <span key={i} className={`token token-${token.type} ${colorClass}`}>
        {token.text}
      </span>
    );
  });
}

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export function computeLineDiff(original: string, current: string): DiffLine[] {
  const orig = original ? original.split('\n') : [];
  const curr = current ? current.split('\n') : [];

  const n = orig.length;
  const m = curr.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (orig[i] === curr[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const backtrack: DiffLine[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === curr[j - 1]) {
      backtrack.push({
        type: 'unchanged',
        oldLineNumber: i,
        newLineNumber: j,
        text: orig[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtrack.push({
        type: 'added',
        newLineNumber: j,
        text: curr[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      backtrack.push({
        type: 'removed',
        oldLineNumber: i,
        text: orig[i - 1],
      });
      i--;
    }
  }

  return backtrack.reverse();
}

export interface BlameLineInfo {
  sha: string;
  author: string;
  date: string;
  message: string;
}

export function getMockBlame(lineNumber: number, filePath: string): BlameLineInfo {
  if (lineNumber % 3 === 1) {
    return {
      sha: '948e3612',
      author: 'Developer 6',
      date: '2 hours ago',
      message: `feat(core): sovereign IDE enhancement in ${filePath.split('/').pop() || filePath}`,
    };
  } else if (lineNumber % 3 === 2) {
    return {
      sha: 'a710bc4e',
      author: 'Developer 2',
      date: 'Yesterday',
      message: 'test(qa): add regression coverage sentinel',
    };
  } else {
    return {
      sha: 'f189d230',
      author: 'CEO Astra',
      date: '3 days ago',
      message: 'refactor(arch): zero external tracking signature',
    };
  }
}

export interface CommitHistoryItem {
  sha: string;
  author: string;
  date: string;
  message: string;
}

export function getMockFileHistory(filePath: string): CommitHistoryItem[] {
  const name = filePath.split('/').pop() || 'file';
  return [
    {
      sha: '948e3612a4b8',
      author: 'Developer 6',
      date: '2 hours ago',
      message: `feat: implement sovereign in-browser IDE parity for ${name}`,
    },
    {
      sha: 'a710bc4e921d',
      author: 'Developer 2',
      date: 'Yesterday',
      message: `test: add Vitest QA sentinel coverage for ${name}`,
    },
    {
      sha: 'f189d23081ca',
      author: 'CEO Astra',
      date: '3 days ago',
      message: `refactor: harden architecture and security boundaries`,
    },
    {
      sha: 'c3d4e5f67890',
      author: 'Developer 1',
      date: '5 days ago',
      message: `Initial commit for ${name}`,
    },
  ];
}

export interface CodeTabProps {
  selectedRepo: Repo;
  currentBranch: string;
  repoBranches?: string[];
  currentPath?: string;
  files: FileNode[];
  setModalState: (modal: any) => void;
  openBlobEditor: (file: FileNode) => Promise<void>;
  onNavigatePath?: (path: string) => void;
  onSelectBranch?: (branch: string) => void;
  showToast: (msg: string) => void;
  onCommitBlob?: (input: CommitBlobInput) => Promise<void>;
  onDeleteBlob?: (path: string, message: string, branch: string) => Promise<void>;
  initialEditingFile?: FileNode | null;
  initialEditorMode?: 'edit' | 'preview' | 'diff';
  initialIsBlameActive?: boolean;
  initialIsRawActive?: boolean;
  initialIsSearchOpen?: boolean;
  initialIsDeleteModalOpen?: boolean;
  initialSearchQuery?: string;
  initialReplaceQuery?: string;
}

// Helper to determine specialized file icons
function getFileIcon(name: string, isDir: boolean, isExpanded = false) {
  if (isDir) {
    return isExpanded ? (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#58A6FF" className="shrink-0">
        <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H14.25c.966 0 1.75.784 1.75 1.75v.5H1.75a.25.25 0 0 0-.25.25v7.5c0 .034.007.067.02.098L.513 1.513ZM15.5 6.25H2.187l1.79 6.262A1.75 1.75 0 0 0 5.66 13.75h8.59a1.75 1.75 0 0 0 1.75-1.75V6.25Z" />
      </svg>
    ) : (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#58A6FF" className="shrink-0">
        <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
      </svg>
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#79C0FF" className="shrink-0">
        <path d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25Zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06l-4.25-4.25Z" />
      </svg>
    );
  }

  if (ext === 'md' || ext === 'txt') {
    return (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#FFA657" className="shrink-0">
        <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.53-.53a3.75 3.75 0 0 1 2.65-1.094h3.57V2.5h-3.006a2.25 2.25 0 0 0-2.25 2.25v6.524ZM6.75 4.75A2.25 2.25 0 0 0 4.504 2.5H1.5v7.95h3.757a3.75 3.75 0 0 1 2.651 1.094Z" />
      </svg>
    );
  }

  if (ext === 'json' || ext === 'yaml' || ext === 'yml') {
    return (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#FF7B72" className="shrink-0">
        <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
      </svg>
    );
  }

  if (ext === 'kt' || ext === 'kts' || ext === 'apk') {
    return (
      <svg height="16" viewBox="0 0 16 16" width="16" fill="#3FB950" className="shrink-0">
        <path d="M3.5 2.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .75.75v11a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-11Zm1.5.75v9.5h6V3.25H5Z" />
      </svg>
    );
  }

  // Default file icon
  return (
    <svg height="16" viewBox="0 0 16 16" width="16" fill="#7D8590" className="shrink-0">
      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.793V4.25c0 .138.112.25.25.25h2.457Z" />
    </svg>
  );
}

export function CodeTab({
  selectedRepo,
  currentBranch,
  repoBranches,
  currentPath = '',
  files,
  setModalState,
  openBlobEditor,
  onNavigatePath,
  onSelectBranch,
  showToast,
  onCommitBlob,
  onDeleteBlob,
  initialEditingFile = null,
  initialEditorMode = 'edit',
  initialIsBlameActive = false,
  initialIsRawActive = false,
  initialIsSearchOpen = false,
  initialIsDeleteModalOpen = false,
  initialSearchQuery = '',
  initialReplaceQuery = '',
}: CodeTabProps) {
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isCodeMenuOpen, setIsCodeMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'directory' | 'tree'>('directory');
  const [filterQuery, setFilterQuery] = useState('');
  const [editingFile, setEditingFile] = useState<FileNode | null>(initialEditingFile);
  const [originalFileContent, setOriginalFileContent] = useState<string>(
    initialEditingFile?.content || '',
  );
  const [originalPath, setOriginalPath] = useState<string>(initialEditingFile?.path || '');
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);
  const [editorTheme, setEditorTheme] = useState<'github-dark' | 'github-light'>('github-dark');
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'diff'>(initialEditorMode);
  const [diffViewStyle, setDiffViewStyle] = useState<'split' | 'unified'>('split');
  const [isBlameActive, setIsBlameActive] = useState(initialIsBlameActive);
  const [isRawActive, setIsRawActive] = useState(initialIsRawActive);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(initialIsDeleteModalOpen);
  const [isSearchOpen, setIsSearchOpen] = useState(initialIsSearchOpen);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [replaceQuery, setReplaceQuery] = useState(initialReplaceQuery);
  const [matchCase, setMatchCase] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [branchAction, setBranchAction] = useState<'direct' | 'pr'>('direct');
  const [isCommitting, setIsCommitting] = useState(false);

  const [deleteCommitMessage, setDeleteCommitMessage] = useState(
    initialEditingFile ? `Delete ${initialEditingFile.name}` : '',
  );
  const [deleteCommitDescription, setDeleteCommitDescription] = useState('');
  const [deleteBranchAction, setDeleteBranchAction] = useState<'direct' | 'pr'>('direct');
  const [isDeleting, setIsDeleting] = useState(false);

  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    // Expand root dirs or active path by default
    const set = new Set<string>();
    if (currentPath) {
      const parts = currentPath.split('/');
      for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    }
    return set;
  });

  const branchCount =
    repoBranches?.length || selectedRepo.branches?.length || selectedRepo.branchCount || 1;
  const commitCount = selectedRepo.commitCount || (selectedRepo.latestCommitSha ? 2118 : 1);

  // Search occurrences in editingFile
  const searchMatches = useMemo(() => {
    if (!searchQuery || !editingFile?.content) return [];
    const text = editingFile.content;
    const q = matchCase ? searchQuery : searchQuery.toLowerCase();
    const target = matchCase ? text : text.toLowerCase();
    const indices: number[] = [];
    let pos = 0;
    while ((pos = target.indexOf(q, pos)) !== -1) {
      indices.push(pos);
      pos += Math.max(1, q.length);
    }
    return indices;
  }, [searchQuery, editingFile?.content, matchCase]);

  const searchMatchesCount = searchMatches.length;

  const handleNextMatch = () => {
    if (searchMatchesCount === 0) return;
    setActiveMatchIdx((prev) => (prev + 1) % searchMatchesCount);
  };

  const handlePrevMatch = () => {
    if (searchMatchesCount === 0) return;
    setActiveMatchIdx((prev) => (prev - 1 + searchMatchesCount) % searchMatchesCount);
  };

  const handleReplaceOne = () => {
    if (searchMatchesCount === 0 || !editingFile) return;
    const currentContent = editingFile.content || '';
    const matchPos = searchMatches[activeMatchIdx] ?? searchMatches[0];
    if (matchPos === undefined) return;
    const before = currentContent.slice(0, matchPos);
    const after = currentContent.slice(matchPos + searchQuery.length);
    const newContent = `${before}${replaceQuery}${after}`;
    setEditingFile({ ...editingFile, content: newContent });
    showToast('Replaced occurrence');
  };

  const handleReplaceAll = () => {
    if (searchMatchesCount === 0 || !editingFile) return;
    const currentContent = editingFile.content || '';
    let newContent = '';
    if (matchCase) {
      newContent = currentContent.split(searchQuery).join(replaceQuery);
    } else {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      newContent = currentContent.replace(new RegExp(escaped, 'gi'), replaceQuery);
    }
    setEditingFile({ ...editingFile, content: newContent });
    showToast(`Replaced ${searchMatchesCount} occurrences`);
    setActiveMatchIdx(0);
  };

  // Diff computation between original and current content
  const diffLines = useMemo(() => {
    return computeLineDiff(originalFileContent, editingFile?.content || '');
  }, [originalFileContent, editingFile?.content]);

  const diffSummary = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const l of diffLines) {
      if (l.type === 'added') additions++;
      if (l.type === 'removed') deletions++;
    }
    return { additions, deletions };
  }, [diffLines]);

  // Keyboard shortcut listener for Ctrl+F and Escape
  React.useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (editingFile) {
          e.preventDefault();
          setIsSearchOpen(true);
        }
      } else if (e.key === 'Escape') {
        if (isSearchOpen) setIsSearchOpen(false);
        if (isDeleteModalOpen) setIsDeleteModalOpen(false);
        if (isHistoryOpen) setIsHistoryOpen(false);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [editingFile, isSearchOpen, isDeleteModalOpen, isHistoryOpen]);

  // Handle Delete File commit
  const handleConfirmDelete = async () => {
    if (!editingFile) return;
    setIsDeleting(true);
    try {
      const finalMsg = `${deleteCommitMessage.trim()}${
        deleteCommitDescription ? `\n\n${deleteCommitDescription.trim()}` : ''
      }`;
      if (onDeleteBlob) {
        await onDeleteBlob(editingFile.path, finalMsg, currentBranch);
      } else if (onCommitBlob) {
        await onCommitBlob({
          path: editingFile.path,
          branch: currentBranch,
          content: '',
          message: finalMsg,
          expectedBlobSha: (editingFile as any).sha || (editingFile as any).blobSha || '',
          isDelete: true,
        });
      } else {
        showToast(`Deleted ${editingFile.path}`);
      }
      setIsDeleteModalOpen(false);
      setEditingFile(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete file.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle directory inline expansion in tree view
  const toggleDirExpand = (dirPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const expandAllDirs = () => {
    const allDirs = files.filter((f) => f.type === 'dir').map((f) => f.path);
    setExpandedDirs(new Set(allDirs));
  };

  const collapseAllDirs = () => {
    setExpandedDirs(new Set());
  };

  // Find README.md in files or fallback
  const readmeFile = useMemo(() => {
    return (
      files.find((f) => f.name.toLowerCase() === 'readme.md') ||
      files.find((f) => f.path.toLowerCase().endsWith('readme.md'))
    );
  }, [files]);

  const defaultReadmeContent = useMemo(() => {
    if (readmeFile?.content) return readmeFile.content;
    return `# ${selectedRepo.name}

${selectedRepo.description || 'Sovereign workspace, autonomous AI swarm, Git hub & Android client.'}

\`\`\`bash
# Clone with Sovereign Quant CLI:
quant repo clone ${selectedRepo.fullName || selectedRepo.name}

# Or clone via Git:
git clone ${selectedRepo.cloneUrl}

# Install dependencies and start development
pnpm install && pnpm dev
\`\`\`

## 📦 Features
- **Real Git File Tree**: Full hierarchical folder drilling & breadcrumb navigation.
- **Syntax-Highlighted Markdown**: Live GFM parsing with multi-language code fences.
- **Sovereign Collaboration**: 1:1 GitHub parity with Git Smart HTTP and real PR reviews.

| Component | Status | Language |
| :--- | :--- | :--- |
| \`CodeTab\` | Verified | TypeScript |
| \`MarkdownPreview\` | Active | TypeScript |
| \`BranchSelector\` | Active | TypeScript |

> [!NOTE]
> All repository operations run with zero external tracking and local cryptographic signatures.`;
  }, [readmeFile, selectedRepo]);

  // Compute children count per directory
  const dirCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      if (f.path.includes('/')) {
        const parent = f.path.substring(0, f.path.lastIndexOf('/'));
        map.set(parent, (map.get(parent) || 0) + 1);
      }
    }
    return map;
  }, [files]);

  // Normalized Directory / Tree List Items
  const displayedItems = useMemo(() => {
    // If filter query is active, search across all files
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      return files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          (f.lastCommit && f.lastCommit.toLowerCase().includes(q)),
      );
    }

    if (viewMode === 'tree') {
      const result: Array<FileNode & { depth: number; isExpanded?: boolean }> = [];

      const sorted = [...files].sort((a, b) => {
        if (a.path === b.path) return 0;
        return a.path.localeCompare(b.path);
      });

      const addChildren = (parentPath: string, depth: number) => {
        const directChildren = sorted.filter((f) => {
          if (!parentPath) {
            return !f.path.includes('/');
          }
          if (!f.path.startsWith(`${parentPath}/`)) return false;
          const rest = f.path.slice(parentPath.length + 1);
          return !rest.includes('/');
        });

        directChildren.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        for (const child of directChildren) {
          const isExpanded = expandedDirs.has(child.path);
          result.push({ ...child, depth, isExpanded });
          if (child.type === 'dir' && isExpanded) {
            addChildren(child.path, depth + 1);
          }
        }
      };

      addChildren('', 0);
      return result;
    }

    // Directory Drill Mode
    const prefix = currentPath ? `${currentPath}/` : '';
    const directChildren = files.filter((f) => {
      if (!currentPath) {
        return !f.path.includes('/');
      }
      if (!f.path.startsWith(prefix)) return false;
      const rest = f.path.slice(prefix.length);
      return !rest.includes('/');
    });

    const result: Array<FileNode & { depth: number; isExpanded?: boolean }> = [];

    directChildren.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of directChildren) {
      const isExpanded = expandedDirs.has(child.path);
      result.push({ ...child, depth: 0, isExpanded });

      if (child.type === 'dir' && isExpanded) {
        const subChildren = files.filter((sub) => {
          if (!sub.path.startsWith(`${child.path}/`)) return false;
          const rest = sub.path.slice(child.path.length + 1);
          return !rest.includes('/');
        });
        subChildren.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const sub of subChildren) {
          result.push({ ...sub, depth: 1, isExpanded: expandedDirs.has(sub.path) });
        }
      }
    }

    return result;
  }, [files, currentPath, viewMode, filterQuery, expandedDirs]);

  // Compute parent path for ".." navigation
  const parentPath = useMemo(() => {
    if (!currentPath) return null;
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
  }, [currentPath]);

  // Breadcrumb Path Segments (e.g. root / packages / storage / src / index.ts)
  const breadcrumbSegments = useMemo(() => {
    const rawSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];
    return [
      { name: selectedRepo.name || 'root', path: '', isRoot: true },
      ...rawSegments.map((seg, idx, arr) => ({
        name: seg,
        path: arr.slice(0, idx + 1).join('/'),
        isRoot: false,
      })),
    ];
  }, [currentPath, selectedRepo.name]);

  const copyPathToClipboard = () => {
    const fullPath = currentPath ? `${selectedRepo.name}/${currentPath}` : selectedRepo.name;
    navigator.clipboard?.writeText(fullPath);
    showToast(`Copied path: ${fullPath}`);
  };

  if (editingFile) {
    const detectedLang = detectLanguage(editingFile.path || editingFile.name);
    const isMarkdown = detectedLang === 'markdown';
    const lines = editingFile.content !== undefined ? editingFile.content.split('\n') : [''];
    const isRenamed = Boolean(originalPath && editingFile.path !== originalPath);
    const isNewFile = !originalPath;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div
          className={`lg:col-span-4 flex flex-col rounded-xl border ${
            editorTheme === 'github-dark'
              ? 'bg-[#0D1117] text-[#E6EDF3] border-[#30363D]'
              : 'bg-white text-[#1F2328] border-[#D0D7DE]'
          }`}
        >
          {/* Breadcrumb Path Bar & In-Editor Toolbar */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
              editorTheme === 'github-dark'
                ? 'bg-[#161B22] border-[#30363D]'
                : 'bg-[#F6F8FA] border-[#D0D7DE]'
            }`}
          >
            {/* File Path Renaming & Branch Indicator */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <span className="text-xs font-mono text-[#7D8590]">{selectedRepo.name} /</span>
              <input
                type="text"
                data-testid="file-path-input"
                value={editingFile.path}
                onChange={(e) => {
                  const newPath = e.target.value;
                  const newName = newPath.split('/').pop() || editingFile.name;
                  setEditingFile({
                    ...editingFile,
                    path: newPath,
                    name: newName,
                  });
                  if (originalPath && newPath !== originalPath) {
                    setCommitMessage(`Rename ${originalPath} to ${newPath}`);
                  }
                }}
                placeholder="Name your file..."
                className={`flex-1 px-3 py-1 rounded font-mono text-xs border ${
                  editorTheme === 'github-dark'
                    ? 'bg-[#0D1117] text-white border-[#30363D] focus:border-[#58A6FF]'
                    : 'bg-white text-black border-[#D0D7DE] focus:border-[#0969DA]'
                } focus:outline-none`}
              />
              {isRenamed && (
                <span
                  data-testid="file-renamed-pill"
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#E3B341]/20 text-[#E3B341] border border-[#E3B341]/40 flex items-center gap-1"
                  title={`File moved from ${originalPath}`}
                >
                  <span>Renamed</span>
                </span>
              )}
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#21262D] text-[#58A6FF] border border-[#30363D]">
                {currentBranch}
              </span>
            </div>

            {/* In-Editor Toolbar Actions & Mode Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Mode Switcher: Edit vs Preview vs Split Diff */}
              <div className="flex rounded border border-[#30363D] overflow-hidden">
                <button
                  type="button"
                  data-testid="mode-edit-button"
                  onClick={() => {
                    setEditorMode('edit');
                    setIsRawActive(false);
                  }}
                  className={`px-3 py-1 text-xs font-semibold ${
                    editorMode === 'edit' && !isRawActive
                      ? 'bg-[#238636] text-white'
                      : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  data-testid="mode-preview-button"
                  onClick={() => {
                    setEditorMode('preview');
                    setIsRawActive(false);
                  }}
                  className={`px-3 py-1 text-xs font-semibold ${
                    editorMode === 'preview' && !isRawActive
                      ? 'bg-[#238636] text-white'
                      : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  data-testid="mode-diff-button"
                  onClick={() => {
                    setEditorMode('diff');
                    setIsRawActive(false);
                  }}
                  className={`px-3 py-1 text-xs font-semibold flex items-center gap-1.5 ${
                    editorMode === 'diff' && !isRawActive
                      ? 'bg-[#238636] text-white'
                      : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                  }`}
                  title="Split Diff view comparing original vs edits"
                >
                  <span>Split Diff</span>
                  {diffSummary.additions > 0 && (
                    <span className="text-[#3FB950] text-[10px] font-mono">
                      +{diffSummary.additions}
                    </span>
                  )}
                  {diffSummary.deletions > 0 && (
                    <span className="text-[#F85149] text-[10px] font-mono">
                      -{diffSummary.deletions}
                    </span>
                  )}
                </button>
              </div>

              {/* In-Editor Search & Replace Trigger */}
              <button
                type="button"
                data-testid="search-toggle-button"
                onClick={() => setIsSearchOpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1 font-semibold transition-colors ${
                  isSearchOpen
                    ? 'bg-[#388BFD]/20 border-[#388BFD] text-[#58A6FF]'
                    : 'border-[#30363D] bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]'
                }`}
                title="Search and Replace (Ctrl+F)"
              >
                <svg height="13" viewBox="0 0 16 16" width="13" fill="currentColor">
                  <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
                </svg>
                <span>Find</span>
              </button>

              {/* Raw View Button */}
              <button
                type="button"
                data-testid="raw-code-button"
                onClick={() => setIsRawActive((prev) => !prev)}
                className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                  isRawActive
                    ? 'bg-[#388BFD]/20 border-[#388BFD] text-[#58A6FF]'
                    : 'border-[#30363D] bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]'
                }`}
                title="Open plain unformatted code view"
              >
                Raw
              </button>

              {/* Blame Toggle */}
              <button
                type="button"
                data-testid="blame-toggle-button"
                onClick={() => setIsBlameActive((prev) => !prev)}
                className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                  isBlameActive
                    ? 'bg-[#388BFD]/20 border-[#388BFD] text-[#58A6FF]'
                    : 'border-[#30363D] bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]'
                }`}
                title="Toggle git commit blame author annotations"
              >
                Blame
              </button>

              {/* History Button */}
              <button
                type="button"
                data-testid="file-history-button"
                onClick={() => setIsHistoryOpen(true)}
                className="px-2.5 py-1 rounded border border-[#30363D] bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D] text-xs font-semibold"
                title="Open file commit history"
              >
                History
              </button>

              {/* Delete File Button (for existing files) */}
              {!isNewFile && (
                <button
                  type="button"
                  data-testid="delete-file-button"
                  onClick={() => {
                    setDeleteCommitMessage(`Delete ${editingFile.name}`);
                    setIsDeleteModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded border border-[#DA3633] text-xs bg-[#DA3633]/10 text-[#F85149] hover:bg-[#DA3633]/20 flex items-center gap-1 font-semibold"
                  title="Delete this file"
                >
                  <svg height="13" viewBox="0 0 16 16" width="13" fill="currentColor">
                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.15l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                  </svg>
                  <span>Delete</span>
                </button>
              )}

              {/* Theme Switcher */}
              <button
                type="button"
                onClick={() =>
                  setEditorTheme((t) => (t === 'github-dark' ? 'github-light' : 'github-dark'))
                }
                className="px-2.5 py-1 rounded border border-[#30363D] text-xs bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]"
              >
                {editorTheme === 'github-dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
          </div>

          {/* Search & Replace Widget */}
          {isSearchOpen && (
            <div
              data-testid="search-replace-widget"
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b text-xs ${
                editorTheme === 'github-dark'
                  ? 'bg-[#161B22] border-[#30363D]'
                  : 'bg-[#F6F8FA] border-[#D0D7DE]'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search Input */}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    data-testid="search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setActiveMatchIdx(0);
                    }}
                    placeholder="Find in file..."
                    className={`px-2.5 py-1 rounded border font-mono text-xs w-48 ${
                      editorTheme === 'github-dark'
                        ? 'bg-[#0D1117] text-white border-[#30363D] focus:border-[#58A6FF]'
                        : 'bg-white text-black border-[#D0D7DE] focus:border-[#0969DA]'
                    } focus:outline-none`}
                  />
                  <span
                    data-testid="search-match-count"
                    className="text-[11px] text-[#7D8590] font-mono px-1.5"
                  >
                    {searchMatchesCount === 0
                      ? searchQuery
                        ? '0 of 0'
                        : 'no matches'
                      : `${activeMatchIdx + 1} of ${searchMatchesCount}`}
                  </span>
                  <button
                    type="button"
                    data-testid="search-prev-button"
                    onClick={handlePrevMatch}
                    disabled={searchMatchesCount === 0}
                    className="p-1 rounded hover:bg-[#30363D] disabled:opacity-40 text-[#7D8590] hover:text-white"
                    title="Previous match (Shift+Enter)"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    data-testid="search-next-button"
                    onClick={handleNextMatch}
                    disabled={searchMatchesCount === 0}
                    className="p-1 rounded hover:bg-[#30363D] disabled:opacity-40 text-[#7D8590] hover:text-white"
                    title="Next match (Enter)"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    data-testid="match-case-button"
                    onClick={() => setMatchCase((prev) => !prev)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                      matchCase
                        ? 'bg-[#388BFD]/30 text-[#58A6FF] border border-[#388BFD]'
                        : 'text-[#7D8590] hover:text-white'
                    }`}
                    title="Match Case"
                  >
                    Aa
                  </button>
                </div>

                {/* Replace Input & Controls */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-[#30363D]">
                  <input
                    type="text"
                    data-testid="replace-input"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder="Replace with..."
                    className={`px-2.5 py-1 rounded border font-mono text-xs w-44 ${
                      editorTheme === 'github-dark'
                        ? 'bg-[#0D1117] text-white border-[#30363D] focus:border-[#58A6FF]'
                        : 'bg-white text-black border-[#D0D7DE] focus:border-[#0969DA]'
                    } focus:outline-none`}
                  />
                  <button
                    type="button"
                    data-testid="replace-one-button"
                    onClick={handleReplaceOne}
                    disabled={searchMatchesCount === 0}
                    className="px-2 py-1 rounded bg-[#21262D] border border-[#30363D] hover:bg-[#30363D] text-[11px] font-semibold disabled:opacity-40"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    data-testid="replace-all-button"
                    onClick={handleReplaceAll}
                    disabled={searchMatchesCount === 0}
                    className="px-2 py-1 rounded bg-[#21262D] border border-[#30363D] hover:bg-[#30363D] text-[11px] font-semibold disabled:opacity-40"
                  >
                    Replace all
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                data-testid="search-close-button"
                onClick={() => setIsSearchOpen(false)}
                className="text-[#7D8590] hover:text-white px-2 py-1 text-xs"
                title="Close search (Esc)"
              >
                ✕
              </button>
            </div>
          )}

          {/* Editor Body */}
          <div className="flex-1 min-h-[350px] relative flex flex-col overflow-hidden">
            {isRawActive ? (
              /* 1. Raw Plain Unformatted View */
              <div
                data-testid="raw-code-view"
                className={`flex-1 p-4 overflow-auto font-mono text-xs ${
                  editorTheme === 'github-dark'
                    ? 'bg-[#0D1117] text-[#E6EDF3]'
                    : 'bg-white text-[#1F2328]'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#30363D] text-[11px] text-[#7D8590]">
                  <span>Viewing raw source</span>
                  <button
                    type="button"
                    data-testid="copy-raw-button"
                    onClick={() => {
                      navigator.clipboard?.writeText(editingFile.content || '');
                      showToast('Copied raw contents to clipboard');
                    }}
                    className="px-2.5 py-1 rounded bg-[#21262D] text-white hover:bg-[#30363D] transition-colors"
                  >
                    Copy raw
                  </button>
                </div>
                <pre className="whitespace-pre overflow-x-auto leading-5">
                  {editingFile.content || ''}
                </pre>
              </div>
            ) : editorMode === 'preview' ? (
              /* 2. Preview Mode: MarkdownPreview for .md, Syntax Highlighted for Code */
              isMarkdown ? (
                <div className="flex-1 p-6 overflow-y-auto">
                  <MarkdownPreview
                    content={editingFile.content || ''}
                    repoName={selectedRepo.name}
                    cloneUrl={selectedRepo.cloneUrl}
                    defaultBranch={currentBranch}
                    onEdit={() => setEditorMode('edit')}
                  />
                </div>
              ) : (
                <div
                  data-testid="syntax-highlighted-preview"
                  className={`flex flex-1 min-h-0 font-mono text-xs overflow-auto ${
                    editorTheme === 'github-dark'
                      ? 'bg-[#0D1117] text-[#E6EDF3]'
                      : 'bg-white text-[#1F2328]'
                  }`}
                >
                  {/* Line numbers gutter */}
                  <div
                    aria-hidden="true"
                    className={`select-none py-3 px-3 text-right border-r font-mono text-[11px] leading-6 shrink-0 ${
                      editorTheme === 'github-dark'
                        ? 'bg-[#0D1117] text-[#484F58] border-[#30363D]'
                        : 'bg-[#F6F8FA] text-[#8C959F] border-[#D0D7DE]'
                    }`}
                  >
                    {lines.map((_, idx) => (
                      <div key={idx}>{idx + 1}</div>
                    ))}
                  </div>

                  {/* Tokenized Lines */}
                  <div className="p-3 flex-1 overflow-x-auto leading-6 whitespace-pre">
                    {lines.map((line, idx) => (
                      <div key={idx} className="hover:bg-[#161B22]/60 px-1 rounded">
                        {renderSyntaxHighlightedLine(line, detectedLang, editorTheme)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : editorMode === 'diff' ? (
              /* 3. Split Diff Mode: Side-by-side or Unified Diff View */
              <div
                data-testid="split-diff-view"
                className="flex-1 flex flex-col min-h-[350px] overflow-hidden"
              >
                {/* Diff Sub-Header */}
                <div
                  className={`flex items-center justify-between px-4 py-2 border-b text-xs ${
                    editorTheme === 'github-dark'
                      ? 'bg-[#161B22] border-[#30363D]'
                      : 'bg-[#F6F8FA] border-[#D0D7DE]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Diff Comparison</span>
                    <span className="text-[11px] text-[#7D8590]">
                      Comparing base ({originalPath || editingFile.path}) vs working edits
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="diff-additions-badge"
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40 font-bold"
                    >
                      +{diffSummary.additions}
                    </span>
                    <span
                      data-testid="diff-deletions-badge"
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#DA3633]/20 text-[#F85149] border border-[#DA3633]/40 font-bold"
                    >
                      -{diffSummary.deletions}
                    </span>
                    <div className="flex rounded border border-[#30363D] overflow-hidden text-[11px]">
                      <button
                        type="button"
                        onClick={() => setDiffViewStyle('split')}
                        className={`px-2 py-0.5 ${
                          diffViewStyle === 'split' ? 'bg-[#21262D] text-white' : 'text-[#7D8590]'
                        }`}
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffViewStyle('unified')}
                        className={`px-2 py-0.5 ${
                          diffViewStyle === 'unified' ? 'bg-[#21262D] text-white' : 'text-[#7D8590]'
                        }`}
                      >
                        Unified
                      </button>
                    </div>
                  </div>
                </div>

                {/* Diff Body */}
                <div
                  className={`flex-1 overflow-auto font-mono text-xs ${
                    editorTheme === 'github-dark'
                      ? 'bg-[#0D1117] text-[#E6EDF3]'
                      : 'bg-white text-[#1F2328]'
                  }`}
                >
                  {diffViewStyle === 'split' ? (
                    <div className="grid grid-cols-2 divide-x divide-[#30363D] min-w-full">
                      {/* Left: Original Base */}
                      <div className="p-2 space-y-0.5">
                        <div className="text-[10px] text-[#7D8590] uppercase tracking-wider font-bold pb-1 border-b border-[#30363D] mb-1">
                          Original Base (
                          {originalFileContent ? originalFileContent.split('\n').length : 0} lines)
                        </div>
                        {originalFileContent.split('\n').map((line, idx) => (
                          <div key={idx} className="flex gap-2 leading-5 hover:bg-[#161B22]/50">
                            <span className="w-8 text-right text-[#484F58] select-none text-[11px] shrink-0">
                              {idx + 1}
                            </span>
                            <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                          </div>
                        ))}
                      </div>

                      {/* Right: Current Edits */}
                      <div className="p-2 space-y-0.5">
                        <div className="text-[10px] text-[#7D8590] uppercase tracking-wider font-bold pb-1 border-b border-[#30363D] mb-1">
                          Current Edits ({lines.length} lines)
                        </div>
                        {lines.map((line, idx) => (
                          <div key={idx} className="flex gap-2 leading-5 hover:bg-[#161B22]/50">
                            <span className="w-8 text-right text-[#484F58] select-none text-[11px] shrink-0">
                              {idx + 1}
                            </span>
                            <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Unified Diff */
                    <div className="divide-y divide-[#21262D]">
                      {diffLines.map((line, idx) => {
                        const isAdd = line.type === 'added';
                        const isDel = line.type === 'removed';
                        return (
                          <div
                            key={idx}
                            className={`flex items-start text-xs font-mono leading-5 ${
                              isAdd
                                ? 'bg-[#238636]/15 text-[#3FB950] border-l-2 border-[#238636]'
                                : isDel
                                  ? 'bg-[#DA3633]/15 text-[#F85149] border-l-2 border-[#DA3633]'
                                  : 'text-[#E6EDF3]'
                            }`}
                          >
                            <div className="flex shrink-0 select-none text-[11px] text-[#484F58] border-r border-[#30363D] w-16 justify-between px-2">
                              <span className="w-6 text-right">{line.oldLineNumber ?? ''}</span>
                              <span className="w-6 text-right">{line.newLineNumber ?? ''}</span>
                            </div>
                            <span className="w-5 text-center select-none font-bold shrink-0">
                              {isAdd ? '+' : isDel ? '-' : ' '}
                            </span>
                            <span className="whitespace-pre overflow-x-auto py-0.5 pr-2 flex-1">
                              {line.text || ' '}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* 4. Edit Mode: Interactive Code Editor with Blame column and line numbers */
              <div
                className={`flex flex-1 min-h-0 font-mono text-xs ${
                  editorTheme === 'github-dark'
                    ? 'bg-[#0D1117] text-[#E6EDF3]'
                    : 'bg-white text-[#1F2328]'
                }`}
              >
                {/* Line numbers gutter */}
                <div
                  aria-hidden="true"
                  className={`select-none py-3 px-3 text-right border-r font-mono text-[11px] leading-6 shrink-0 ${
                    editorTheme === 'github-dark'
                      ? 'bg-[#0D1117] text-[#484F58] border-[#30363D]'
                      : 'bg-[#F6F8FA] text-[#8C959F] border-[#D0D7DE]'
                  }`}
                >
                  {lines.map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>

                {/* Optional Git Blame column */}
                {isBlameActive && (
                  <div
                    data-testid="blame-gutter"
                    className={`select-none py-3 px-2 border-r font-mono text-[11px] leading-6 shrink-0 divide-y divide-[#21262D]/60 ${
                      editorTheme === 'github-dark'
                        ? 'bg-[#161B22]/40 text-[#7D8590] border-[#30363D]'
                        : 'bg-[#F6F8FA] text-[#57606A] border-[#D0D7DE]'
                    }`}
                  >
                    {lines.map((_, idx) => {
                      const commit = getMockBlame(idx + 1, editingFile.path);
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 truncate px-1 text-[10px]"
                          title={`${commit.sha}: ${commit.message} (${commit.author})`}
                        >
                          <span className="font-mono text-[#58A6FF]">{commit.sha.slice(0, 7)}</span>
                          <span className="truncate max-w-[80px]">{commit.author}</span>
                          <span className="text-[#8B949E] text-[9px]">{commit.date}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Textarea Code Input */}
                <textarea
                  ref={textareaRef}
                  data-testid="code-editor-textarea"
                  value={editingFile.content || ''}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const val = editingFile.content || '';
                      const updated = `${val.slice(0, start)}  ${val.slice(end)}`;
                      setEditingFile({ ...editingFile, content: updated });
                      requestAnimationFrame(() => {
                        target.selectionStart = start + 2;
                        target.selectionEnd = start + 2;
                      });
                    }
                  }}
                  spellCheck={false}
                  className={`flex-1 p-3 font-mono text-xs leading-6 resize-none focus:outline-none ${
                    editorTheme === 'github-dark'
                      ? 'bg-[#0D1117] text-[#E6EDF3]'
                      : 'bg-white text-[#1F2328]'
                  }`}
                  placeholder="Type your code or markdown content here..."
                />
              </div>
            )}

            {/* Bottom Status Bar */}
            <div
              className={`flex items-center justify-between px-4 py-1.5 text-[11px] border-t ${
                editorTheme === 'github-dark'
                  ? 'bg-[#161B22] border-[#30363D] text-[#7D8590]'
                  : 'bg-[#F6F8FA] border-[#D0D7DE] text-[#656D76]'
              }`}
            >
              <span>
                {lines.length} lines · {(editingFile.content || '').length} characters
              </span>
              <div className="flex items-center gap-3">
                <span className="capitalize">{detectedLang}</span>
                <span>Tab size: 2 spaces</span>
              </div>
            </div>
          </div>

          {/* GitHub-Parity Commit Changes Box */}
          <div
            className={`p-4 border-t space-y-3 ${
              editorTheme === 'github-dark'
                ? 'bg-[#161B22] border-[#30363D]'
                : 'bg-[#F6F8FA] border-[#D0D7DE]'
            }`}
          >
            <h3 className="font-bold text-sm">Commit changes</h3>
            <div className="space-y-2">
              <input
                type="text"
                data-testid="commit-message-input"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={
                  isRenamed
                    ? `Rename ${originalPath} to ${editingFile.path}`
                    : `Update ${editingFile.name || 'file'}`
                }
                className={`w-full px-3 py-1.5 rounded text-xs border ${
                  editorTheme === 'github-dark'
                    ? 'bg-[#0D1117] text-white border-[#30363D] focus:border-[#58A6FF]'
                    : 'bg-white text-black border-[#D0D7DE] focus:border-[#0969DA]'
                } focus:outline-none`}
              />
              <textarea
                data-testid="commit-description-input"
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="Add an optional extended description..."
                rows={2}
                className={`w-full px-3 py-1.5 rounded text-xs border ${
                  editorTheme === 'github-dark'
                    ? 'bg-[#0D1117] text-white border-[#30363D] focus:border-[#58A6FF]'
                    : 'bg-white text-black border-[#D0D7DE] focus:border-[#0969DA]'
                } focus:outline-none`}
              />
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="branchingOption"
                  checked={branchAction === 'direct'}
                  onChange={() => setBranchAction('direct')}
                  className="text-[#238636]"
                />
                <span>
                  Commit directly to the{' '}
                  <strong className="font-mono text-[#58A6FF]">{currentBranch}</strong> branch
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="branchingOption"
                  checked={branchAction === 'pr'}
                  onChange={() => setBranchAction('pr')}
                  className="text-[#238636]"
                />
                <span>
                  Create a <strong className="font-mono text-[#58A6FF]">new branch</strong> for this
                  commit and start a pull request
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                data-testid="cancel-edit-button"
                onClick={() => setEditingFile(null)}
                className="px-4 py-1.5 rounded border border-[#30363D] bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="commit-changes-button"
                disabled={isCommitting || !commitMessage.trim()}
                onClick={async () => {
                  if (!onCommitBlob) {
                    showToast('Commit handler not connected.');
                    return;
                  }
                  setIsCommitting(true);
                  try {
                    await onCommitBlob({
                      path: editingFile.path,
                      branch: currentBranch,
                      content: editingFile.content || '',
                      message: `${commitMessage.trim()}${
                        commitDescription ? `\n\n${commitDescription.trim()}` : ''
                      }`,
                      expectedBlobSha:
                        (editingFile as any).sha || (editingFile as any).blobSha || '',
                      originalPath: isRenamed ? originalPath : undefined,
                    });
                    setEditingFile(null);
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to commit changes.');
                  } finally {
                    setIsCommitting(false);
                  }
                }}
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
              >
                {isCommitting && (
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
                <span>Commit changes</span>
              </button>
            </div>
          </div>
        </div>

        {/* Delete File Dedicated Modal */}
        {isDeleteModalOpen && (
          <div
            data-testid="delete-file-modal"
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-left">
              <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="text-[#F85149]">🗑️</span>
                  <span>Delete {editingFile.name}</span>
                </h3>
                <button
                  type="button"
                  data-testid="close-delete-modal"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="text-[#7D8590] hover:text-white"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#E6EDF3]">
                Are you sure you want to delete{' '}
                <strong className="font-mono text-[#58A6FF]">{editingFile.path}</strong> from the{' '}
                <strong className="font-mono text-[#58A6FF]">{currentBranch}</strong> branch?
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#7D8590]">Commit message</label>
                <input
                  type="text"
                  data-testid="delete-commit-message-input"
                  value={deleteCommitMessage}
                  onChange={(e) => setDeleteCommitMessage(e.target.value)}
                  placeholder={`Delete ${editingFile.name}`}
                  className="w-full px-3 py-1.5 rounded text-xs bg-[#0D1117] text-white border border-[#30363D] focus:border-[#58A6FF] focus:outline-none"
                />
                <textarea
                  data-testid="delete-commit-desc-input"
                  value={deleteCommitDescription}
                  onChange={(e) => setDeleteCommitDescription(e.target.value)}
                  placeholder="Add an optional extended description..."
                  rows={2}
                  className="w-full px-3 py-1.5 rounded text-xs bg-[#0D1117] text-white border border-[#30363D] focus:border-[#58A6FF] focus:outline-none"
                />
              </div>

              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteBranchingOption"
                    checked={deleteBranchAction === 'direct'}
                    onChange={() => setDeleteBranchAction('direct')}
                    className="text-[#DA3633]"
                  />
                  <span>
                    Commit directly to the{' '}
                    <strong className="font-mono text-[#58A6FF]">{currentBranch}</strong> branch
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteBranchingOption"
                    checked={deleteBranchAction === 'pr'}
                    onChange={() => setDeleteBranchAction('pr')}
                    className="text-[#DA3633]"
                  />
                  <span>
                    Create a <strong className="font-mono text-[#58A6FF]">new branch</strong> for
                    this commit and start a pull request
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#30363D]">
                <button
                  type="button"
                  data-testid="cancel-delete-modal-button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-1.5 rounded border border-[#30363D] bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-button"
                  disabled={isDeleting || !deleteCommitMessage.trim()}
                  onClick={handleConfirmDelete}
                  className="px-4 py-1.5 rounded bg-[#DA3633] hover:bg-[#B62324] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                >
                  {isDeleting && (
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  )}
                  <span>Commit changes / Delete file</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {isHistoryOpen && (
          <div
            data-testid="file-history-modal"
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>History for</span>
                  <span className="font-mono text-[#58A6FF]">{editingFile.path}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-[#7D8590] hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {getMockFileHistory(editingFile.path).map((hist) => (
                  <div
                    key={hist.sha}
                    className="p-3 rounded-lg bg-[#0D1117] border border-[#30363D] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{hist.message}</p>
                      <p className="text-[11px] text-[#7D8590]">
                        {hist.author} committed {hist.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#21262D] text-[#58A6FF] border border-[#30363D]">
                        {hist.sha.slice(0, 7)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(hist.sha);
                          showToast(`Copied commit SHA: ${hist.sha}`);
                        }}
                        className="hover:text-white text-[#7D8590] p-1"
                        title="Copy full SHA"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="px-4 py-1.5 rounded border border-[#30363D] bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Left / Main Column (75%) */}
      <div className="lg:col-span-3 space-y-4">
        {/* 1. File Navigation Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Switcher Button */}
            <button
              type="button"
              onClick={() => setIsBranchModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
              </svg>
              <span>{currentBranch}</span>
              <span className="text-[#7D8590] text-[10px]">▼</span>
            </button>

            <span className="text-[#7D8590] hidden sm:inline">
              <span className="text-white font-semibold">{branchCount.toLocaleString()}</span>{' '}
              branches · <span className="text-white font-semibold">2</span> tags
            </span>

            {/* Tree vs Directory View Mode Toggle */}
            <div className="flex items-center bg-[#161B22] border border-[#30363D] rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('directory')}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'directory'
                    ? 'bg-[#21262D] text-white shadow-xs'
                    : 'text-[#7D8590] hover:text-[#E6EDF3]'
                }`}
                title="Directory drill mode"
              >
                📁 Directory
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-[#21262D] text-white shadow-xs'
                    : 'text-[#7D8590] hover:text-[#E6EDF3]'
                }`}
                title="Full hierarchical tree mode"
              >
                🌳 Tree
              </button>
            </div>

            {/* Tree Expand/Collapse All Buttons */}
            {viewMode === 'tree' && (
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={expandAllDirs}
                  className="px-2 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#7D8590] hover:text-white transition-colors"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAllDirs}
                  className="px-2 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#7D8590] hover:text-white transition-colors"
                >
                  Collapse all
                </button>
              </div>
            )}
          </div>

          {/* Quick Filter, Add File & Clone Dropdown */}
          <div className="flex items-center gap-2">
            {/* Instant Filter Input */}
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Filter files..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-36 lg:w-44 px-2.5 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#7D8590] text-xs focus:outline-hidden focus:border-[#58A6FF]"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-1.5 text-[#7D8590] hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setModalState('file-finder')}
              className="px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              title="Go to file (t)"
            >
              Go to file{' '}
              <span className="text-[10px] text-[#7D8590] border border-[#30363D] px-1 rounded ml-1 font-mono">
                t
              </span>
            </button>

            {/* Interactive Add File Dropdown & Upload */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAddFileOpen((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold flex items-center gap-1"
              >
                <span>Add file</span>
                <span className="text-[10px]">▼</span>
              </button>

              {isAddFileOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-md bg-[#161B22] border border-[#30363D] shadow-xl z-50 py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddFileOpen(false);
                      const newPath = currentPath ? `${currentPath}/new-file.ts` : 'new-file.ts';
                      const defaultContent = 'export function newModule() {\n  return true;\n}\n';
                      setEditingFile({
                        path: newPath,
                        name: 'new-file.ts',
                        type: 'file',
                        content: defaultContent,
                      });
                      setOriginalFileContent('');
                      setOriginalPath('');
                      setCommitMessage('Create new-file.ts');
                      setDeleteCommitMessage('');
                      setEditorMode('edit');
                      setIsBlameActive(false);
                      setIsRawActive(false);
                      setIsSearchOpen(false);
                      setIsDeleteModalOpen(false);
                      setIsHistoryOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#21262D] text-[#E6EDF3] flex items-center gap-2 font-medium"
                  >
                    <span className="text-[#3FB950] font-bold">+</span>
                    <span>Create new file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddFileOpen(false);
                      uploadInputRef.current?.click();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#21262D] text-[#E6EDF3] flex items-center gap-2 font-medium border-t border-[#21262D]"
                  >
                    <span className="text-[#58A6FF]">↑</span>
                    <span>Upload files</span>
                  </button>
                </div>
              )}

              <input
                type="file"
                multiple
                ref={uploadInputRef}
                className="hidden"
                onChange={async (e) => {
                  const filesList = e.target.files;
                  if (!filesList || filesList.length === 0) return;
                  for (let i = 0; i < filesList.length; i++) {
                    const uploadedFile = filesList[i];
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      const textContent =
                        typeof event.target?.result === 'string' ? event.target.result : '';
                      const filePath = currentPath
                        ? `${currentPath}/${uploadedFile.name}`
                        : uploadedFile.name;
                      if (onCommitBlob) {
                        try {
                          await onCommitBlob({
                            path: filePath,
                            branch: currentBranch,
                            content: textContent,
                            message: `Upload ${uploadedFile.name}`,
                            expectedBlobSha: '',
                          });
                        } catch (err) {
                          showToast(`Failed to upload ${uploadedFile.name}`);
                        }
                      }
                    };
                    reader.readAsText(uploadedFile);
                  }
                  showToast(`Uploaded ${filesList.length} file(s) successfully`);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Green Code Clone Button & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCodeMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold transition-colors shadow-sm"
              >
                <span>&lt;&gt; Code</span>
                <span className="text-[10px]">▼</span>
              </button>
              <CloneCodespacesMenu
                isOpen={isCodeMenuOpen}
                onClose={() => setIsCodeMenuOpen(false)}
                repoOwner={
                  selectedRepo.fullName ? selectedRepo.fullName.split('/')[0] : 'quantrinitylab'
                }
                repoName={selectedRepo.name}
                currentBranch={currentBranch}
                onLaunchCodespace={(b) => showToast(`Launching cloud Codespace on ${b}...`)}
                showToast={showToast}
              />
            </div>
          </div>
        </div>

        {/* Branch Selector Modal */}
        <BranchSelectorModal
          isOpen={isBranchModalOpen}
          onClose={() => setIsBranchModalOpen(false)}
          currentBranch={currentBranch}
          branches={
            repoBranches && repoBranches.length > 0
              ? repoBranches
              : [currentBranch, 'main', 'feat/speech-telemetry', 'feat/mcp-registry']
          }
          tags={['v1.0.5', 'v1.0.4', 'v1.0.0']}
          defaultBranch={selectedRepo.defaultBranch || 'main'}
          onSelectBranch={(branch) => {
            setIsBranchModalOpen(false);
            onSelectBranch?.(branch);
            showToast(`Switched to branch ${branch}`);
          }}
          onSelectTag={(tag) => {
            setIsBranchModalOpen(false);
            showToast(`Selected tag ${tag}`);
          }}
        />

        {/* 2. Comprehensive Breadcrumb Path Navigator (root / packages / storage / src / index.ts) */}
        <div className="flex items-center justify-between bg-[#161B22] border border-[#30363D] rounded-md px-3.5 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-[#7D8590]">
            <svg height="14" viewBox="0 0 16 16" width="14" fill="#58A6FF" className="shrink-0">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z" />
            </svg>

            {breadcrumbSegments.map((seg, idx) => {
              const isLast = idx === breadcrumbSegments.length - 1;
              return (
                <React.Fragment key={seg.path || 'root'}>
                  {idx > 0 && <span className="text-[#30363D] font-bold">/</span>}
                  {isLast ? (
                    <span className="text-white font-bold flex items-center gap-1">
                      <span>{seg.name}</span>
                      {currentPath && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF]">
                          active
                        </span>
                      )}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigatePath?.(seg.path)}
                      className="text-[#58A6FF] hover:underline font-semibold hover:text-[#79C0FF] transition-colors"
                    >
                      {seg.name}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Copy Path & Item Count */}
          <div className="flex items-center gap-3 shrink-0 text-[#7D8590] text-[11px]">
            <span className="hidden sm:inline">
              <strong className="text-white font-semibold">{displayedItems.length}</strong> items
            </span>
            <button
              type="button"
              onClick={copyPathToClipboard}
              className="hover:text-white flex items-center gap-1 transition-colors"
              title="Copy path"
            >
              <svg height="12" viewBox="0 0 16 16" width="12" fill="currentColor">
                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
              </svg>
              <span>Copy path</span>
            </button>
          </div>
        </div>

        {/* 3. Latest Commit Banner */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-t-md p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-5 h-5 rounded-full bg-[#FF8C42] text-black font-bold flex items-center justify-center text-[10px] shrink-0">
              K
            </span>
            <span className="font-semibold text-white">Developer 6</span>
            <span className="text-[#7D8590] truncate max-w-md" title={selectedRepo.latestCommit}>
              {selectedRepo.latestCommit}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-[#7D8590]">
            <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold flex items-center gap-1">
              ✓ Verified
            </span>
            <button
              type="button"
              onClick={() => showToast(`Commit SHA: ${selectedRepo.latestCommitSha}`)}
              className="font-mono text-[#58A6FF] hover:underline"
            >
              {selectedRepo.latestCommitSha}
            </button>
            <span>· {selectedRepo.latestCommitTime}</span>
            <button
              type="button"
              onClick={() => showToast('Opening commit history...')}
              className="text-white hover:text-[#58A6FF] font-semibold flex items-center gap-1"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .375.65l2.5 1.5a.75.75 0 1 0 .75-1.3L8.75 7.85V4.75Z" />
              </svg>
              {commitCount.toLocaleString()} Commits
            </button>
          </div>
        </div>

        {/* 4. Real File Explorer Tree Table */}
        <div className="border border-t-0 border-[#30363D] rounded-b-md divide-y divide-[#21262D] text-xs bg-[#0D1117] overflow-hidden">
          {/* ".." Parent Directory Row when inside a subfolder in directory mode */}
          {viewMode === 'directory' && parentPath !== null && !filterQuery && (
            <div
              className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#161B22] transition-colors cursor-pointer group bg-[#161B22]/30"
              onClick={() => onNavigatePath?.(parentPath)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg height="16" viewBox="0 0 16 16" width="16" fill="#58A6FF" className="shrink-0">
                  <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                </svg>
                <span className="font-bold text-[#58A6FF] group-hover:underline">..</span>
                <span className="text-[11px] text-[#7D8590]">
                  (Go to parent {parentPath ? `"${parentPath}"` : 'root'})
                </span>
              </div>
              <span className="text-[#7D8590] text-[11px]">parent directory</span>
            </div>
          )}

          {/* Empty state when no matching files */}
          {displayedItems.length === 0 && (
            <div className="px-6 py-8 text-center text-[#7D8590] space-y-1">
              <p className="font-semibold text-white">No files found</p>
              <p className="text-[11px]">
                {filterQuery
                  ? `No matches for "${filterQuery}" in this repository.`
                  : 'This directory is currently empty.'}
              </p>
            </div>
          )}

          {/* File & Folder Rows */}
          {displayedItems.map((file) => {
            const isDir = file.type === 'dir';
            const depth = (file as any).depth || 0;
            const isExpanded = (file as any).isExpanded || false;
            const childCount = isDir ? dirCounts.get(file.path) : undefined;

            return (
              <div
                key={file.path}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#161B22] transition-colors cursor-pointer group"
                style={{ paddingLeft: depth > 0 ? `${depth * 1.5 + 0.875}rem` : '0.875rem' }}
                onClick={() => {
                  if (isDir) {
                    if (viewMode === 'tree') {
                      toggleDirExpand(file.path);
                    } else {
                      if (onNavigatePath) {
                        onNavigatePath(file.path);
                      } else {
                        showToast(`Opening folder ${file.name}`);
                      }
                    }
                  } else {
                    setEditingFile({
                      ...file,
                      content: file.content || '',
                    });
                    setOriginalFileContent(file.content || '');
                    setOriginalPath(file.path);
                    setCommitMessage(`Update ${file.path}`);
                    setDeleteCommitMessage(`Delete ${file.name}`);
                    setEditorMode('edit');
                    setIsBlameActive(false);
                    setIsRawActive(false);
                    setIsSearchOpen(false);
                    setIsDeleteModalOpen(false);
                    setIsHistoryOpen(false);
                  }
                }}
              >
                {/* Left: Icon, Expand Chevron & Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Expand / Collapse Chevron */}
                  {isDir ? (
                    <button
                      type="button"
                      onClick={(e) => toggleDirExpand(file.path, e)}
                      className="w-4 h-4 flex items-center justify-center text-[#7D8590] hover:text-white transition-colors"
                      title={isExpanded ? 'Collapse folder' : 'Expand folder'}
                    >
                      <span className="text-[9px] transform transition-transform duration-150 inline-block">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}

                  {/* File/Folder Icon */}
                  {getFileIcon(file.name, isDir, isExpanded)}

                  {/* Name */}
                  <span
                    className={`truncate font-medium transition-colors ${
                      isDir
                        ? 'text-[#E6EDF3] group-hover:text-[#58A6FF] font-semibold'
                        : 'text-[#C9D1D9] group-hover:text-[#58A6FF]'
                    }`}
                  >
                    {file.name}
                  </span>

                  {/* Child count for directories */}
                  {isDir && typeof childCount === 'number' && childCount > 0 && (
                    <span className="text-[10px] text-[#7D8590] hidden sm:inline font-mono">
                      ({childCount} {childCount === 1 ? 'item' : 'items'})
                    </span>
                  )}
                </div>

                {/* Right: File Size, Commit Message & Timestamp */}
                <div className="flex items-center gap-4 text-[#7D8590] text-[11px] shrink-0">
                  {/* File Size */}
                  <span className="w-16 text-right font-mono text-[10px] text-[#8B949E] hidden md:inline">
                    {file.size || (isDir ? '-' : '0 B')}
                  </span>

                  {/* Commit Message */}
                  <span
                    className="hidden lg:inline truncate max-w-xs text-left"
                    title={file.lastCommit}
                  >
                    {file.lastCommit || 'Update file'}
                  </span>

                  {/* Relative Timestamp */}
                  <span className="text-right w-20 text-[10px] text-[#8B949E]">
                    {file.lastCommitDate || 'recently'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 5. Syntax-Highlighted Markdown README.md Preview Pane */}
        <MarkdownPreview
          content={defaultReadmeContent}
          repoName={selectedRepo.name}
          cloneUrl={selectedRepo.cloneUrl}
          defaultBranch={selectedRepo.defaultBranch || 'main'}
          onEdit={() => {
            if (readmeFile) {
              void openBlobEditor(readmeFile);
            } else {
              showToast('Opening README.md in editor...');
            }
          }}
        />
      </div>

      {/* Right / Sidebar Column (25%) */}
      <div className="lg:col-span-1">
        <RepoSidebarMetadata
          repoOwner={selectedRepo.fullName ? selectedRepo.fullName.split('/')[0] : 'quantrinitylab'}
          repoName={selectedRepo.name}
          description={selectedRepo.description}
          websiteUrl={selectedRepo.website || 'https://quantmail.in'}
          topics={
            selectedRepo.topics && selectedRepo.topics.length > 0
              ? selectedRepo.topics
              : ['web-platform', 'enterprise', 'high-performance']
          }
          starsCount={selectedRepo.stars || 111000}
          forksCount={selectedRepo.forks || 5200}
          watchersCount={selectedRepo.watching || 146}
          releasesCount={28144}
          latestReleaseTag="v1.0.5"
          latestReleaseTime="12 hours ago"
          usedByCount="110K"
          contributorsCount={8}
          languages={[
            { name: 'TypeScript', percentage: 83.9, color: '#3178c6' },
            { name: 'MDX', percentage: 15.6, color: '#fcb32c' },
            { name: 'JavaScript', percentage: 0.5, color: '#f7df1e' },
          ]}
        />
      </div>
    </div>
  );
}
