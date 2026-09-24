'use client';

import React, { useState, useMemo } from 'react';
import type { Repo, FileNode } from '../types';
import { RepoSidebarMetadata } from './RepoSidebarMetadata';
import { BranchSelectorModal } from './BranchSelectorModal';
import { CloneCodespacesMenu } from './CloneCodespacesMenu';
import { MarkdownPreview } from './MarkdownPreview';

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
}: CodeTabProps) {
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isCodeMenuOpen, setIsCodeMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'directory' | 'tree'>('directory');
  const [filterQuery, setFilterQuery] = useState('');
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
# Clone the repository
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
      // Tree Mode: render hierarchical tree with expansion
      const result: Array<FileNode & { depth: number; isExpanded?: boolean }> = [];

      // Sort files by path depth and directories first
      const sorted = [...files].sort((a, b) => {
        if (a.path === b.path) return 0;
        return a.path.localeCompare(b.path);
      });

      // Recursive or iterative tree display
      const addChildren = (parentPath: string, depth: number) => {
        const directChildren = sorted.filter((f) => {
          if (!parentPath) {
            return !f.path.includes('/');
          }
          if (!f.path.startsWith(`${parentPath}/`)) return false;
          const rest = f.path.slice(parentPath.length + 1);
          return !rest.includes('/');
        });

        // Sort directories first, then alphabetically
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

    // Directory Drill Mode:
    // Show direct children of currentPath
    const prefix = currentPath ? `${currentPath}/` : '';
    const directChildren = files.filter((f) => {
      if (!currentPath) {
        return !f.path.includes('/');
      }
      if (!f.path.startsWith(prefix)) return false;
      const rest = f.path.slice(prefix.length);
      return !rest.includes('/');
    });

    // If currentPath is pointing to a directory that has expanded subdirectories inline
    const result: Array<FileNode & { depth: number; isExpanded?: boolean }> = [];

    // Sort directories first
    directChildren.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of directChildren) {
      const isExpanded = expandedDirs.has(child.path);
      result.push({ ...child, depth: 0, isExpanded });

      // If expanded inline in directory view, show immediate children indented
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

            <button
              type="button"
              onClick={() => showToast('Create/Upload file action')}
              className="px-2.5 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
            >
              Add file ▼
            </button>

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
                    void openBlobEditor(file);
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
