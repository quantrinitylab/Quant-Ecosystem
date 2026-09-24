'use client';

import React, { useState } from 'react';
import type { Repo, FileNode } from '../types';
import { RepoSidebarMetadata } from './RepoSidebarMetadata';
import { BranchSelectorModal } from './BranchSelectorModal';
import { CloneCodespacesMenu } from './CloneCodespacesMenu';

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

  const branchCount =
    repoBranches?.length || selectedRepo.branches?.length || selectedRepo.branchCount || 1;
  const commitCount = selectedRepo.commitCount || (selectedRepo.latestCommitSha ? 2118 : 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Left / Main Column (75%) */}
      <div className="lg:col-span-3 space-y-4">
        {/* File Navigation Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
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
          </div>

          {/* Quick Finder, Add File & Clone Dropdown */}
          <div className="flex items-center gap-2">
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

        {/* Breadcrumb Path Navigator */}
        {currentPath && (
          <div className="flex items-center gap-1.5 text-xs text-[#7D8590] px-1 py-1">
            <button
              type="button"
              onClick={() => onNavigatePath?.('')}
              className="text-[#58A6FF] hover:underline font-semibold flex items-center gap-1"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z" />
              </svg>
              {selectedRepo.name}
            </button>
            {currentPath
              .split('/')
              .filter(Boolean)
              .map((segment, idx, arr) => {
                const segPath = arr.slice(0, idx + 1).join('/');
                const isLast = idx === arr.length - 1;
                return (
                  <React.Fragment key={segPath}>
                    <span className="text-[#7D8590]">/</span>
                    {isLast ? (
                      <span className="text-white font-semibold">{segment}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigatePath?.(segPath)}
                        className="text-[#58A6FF] hover:underline font-semibold"
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
          </div>
        )}

        {/* Latest Commit Banner */}
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

        {/* File Tree Table Explorer */}
        <div className="border border-t-0 border-[#30363D] rounded-b-md divide-y divide-[#21262D] text-xs bg-[#0D1117] overflow-hidden">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#161B22] transition-colors cursor-pointer group"
              onClick={() => {
                if (file.type === 'dir') {
                  if (onNavigatePath) {
                    onNavigatePath(file.path);
                  } else {
                    showToast(`Opening folder ${file.name}`);
                  }
                } else {
                  void openBlobEditor(file);
                }
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {file.type === 'dir' ? (
                  <svg
                    height="16"
                    viewBox="0 0 16 16"
                    width="16"
                    fill="#58A6FF"
                    className="shrink-0"
                  >
                    <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                  </svg>
                ) : (
                  <svg
                    height="16"
                    viewBox="0 0 16 16"
                    width="16"
                    fill="#7D8590"
                    className="shrink-0"
                  >
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.793V4.25c0 .138.112.25.25.25h2.457Z" />
                  </svg>
                )}
                <span className="font-medium text-[#E6EDF3] group-hover:text-[#58A6FF] truncate">
                  {file.name}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[#7D8590] text-[11px] shrink-0">
                <span className="hidden md:inline truncate max-w-xs">{file.lastCommit}</span>
                <span className="text-right w-20">{file.lastCommitDate}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Formatted README.md Preview Container */}
        <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden mt-6">
          <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-white">
              <svg height="16" viewBox="0 0 16 16" width="16" fill="#7D8590">
                <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.53-.53a3.75 3.75 0 0 1 2.65-1.094h3.57V2.5h-3.006a2.25 2.25 0 0 0-2.25 2.25v6.524ZM6.75 4.75A2.25 2.25 0 0 0 4.504 2.5H1.5v7.95h3.757a3.75 3.75 0 0 1 2.651 1.094Z" />
              </svg>
              README.md
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#7D8590]">
              <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#3FB950] font-semibold">
                build: passing
              </span>
              <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-semibold">
                license: MIT
              </span>
            </div>
          </div>

          <div className="p-6 space-y-4 text-xs leading-relaxed text-[#E6EDF3]">
            <h2 className="text-xl font-bold text-white border-b border-[#21262D] pb-2">
              Quant Ecosystem — The Next NVIDIA of Software
            </h2>
            <p className="text-[#7D8590]">
              A unified sovereign operating ecosystem built for high-performance computing,
              intelligent mail triage, autonomous agentic development, and real git collaboration.
            </p>

            <div className="bg-[#161B22] border border-[#30363D] rounded-md p-3 font-mono text-[11px] text-[#58A6FF] space-y-1">
              <p className="text-[#7D8590]"># Clone the unified monorepo</p>
              <p>git clone {selectedRepo.cloneUrl}</p>
              <p className="text-[#7D8590] pt-1"># Install dependencies and start development</p>
              <p>pnpm install && pnpm dev</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D]">
                <h4 className="font-bold text-[#FF8C42] mb-1">⚡ Flagship QuantMail</h4>
                <p className="text-[11px] text-[#7D8590]">
                  Inline triage lenses, Bayesian spam protection, and local ONNX embeddings.
                </p>
              </div>
              <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D]">
                <h4 className="font-bold text-[#58A6FF] mb-1">📱 Sovereign Android Client</h4>
                <p className="text-[11px] text-[#7D8590]">
                  Jetpack Compose + hardware-accelerated WebView client in apk testing/.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right / Sidebar Column (25%) */}
      <div className="lg:col-span-1">
        <RepoSidebarMetadata
          repoOwner={selectedRepo.fullName ? selectedRepo.fullName.split('/')[0] : 'quantrinitylab'}
          repoName={selectedRepo.name}
          description={selectedRepo.description}
          websiteUrl={selectedRepo.website || 'https://quant.network'}
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
