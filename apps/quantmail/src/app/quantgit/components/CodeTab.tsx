'use client';

import React from 'react';
import type { Repo, FileNode } from '../types';

export interface CodeTabProps {
  selectedRepo: Repo;
  currentBranch: string;
  files: FileNode[];
  setModalState: (modal: any) => void;
  openBlobEditor: (file: FileNode) => Promise<void>;
  showToast: (msg: string) => void;
}

export function CodeTab({
  selectedRepo,
  currentBranch,
  files,
  setModalState,
  openBlobEditor,
  showToast,
}: CodeTabProps) {
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
              onClick={() => setModalState('branch-switcher')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
              </svg>
              <span>{currentBranch}</span>
              <span className="text-[#7D8590] text-[10px]">▼</span>
            </button>

            <span className="text-[#7D8590] hidden sm:inline">
              <span className="text-white font-semibold">348</span> branches ·{' '}
              <span className="text-white font-semibold">2</span> tags
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

            {/* Green Code Clone Button */}
            <button
              type="button"
              onClick={() => setModalState('clone')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold transition-colors shadow-sm"
            >
              <span>&lt;&gt; Code</span>
              <span className="text-[10px]">▼</span>
            </button>
          </div>
        </div>

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
              2,118 Commits
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
                  showToast(`Opening folder ${file.name}`);
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
      <div className="space-y-6 text-xs">
        {/* About Card */}
        <div className="space-y-3 pb-6 border-b border-[#30363D]">
          <h3 className="font-bold text-sm text-white">About</h3>
          <p className="text-[#7D8590] leading-relaxed">{selectedRepo.description}</p>
          <a
            href={selectedRepo.website}
            target="_blank"
            rel="noreferrer"
            className="text-[#58A6FF] hover:underline font-semibold flex items-center gap-1"
          >
            🔗 {selectedRepo.website.replace('https://', '')}
          </a>

          {/* Topics Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedRepo.topics.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-[#1F242C] text-[#58A6FF] hover:bg-[#28313E] text-[10px] font-semibold cursor-pointer"
              >
                {t}
              </span>
            ))}
          </div>

          <div className="space-y-2 pt-2 text-[#7D8590]">
            <div className="flex items-center gap-2">
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.53-.53a3.75 3.75 0 0 1 2.65-1.094h3.57V2.5h-3.006a2.25 2.25 0 0 0-2.25 2.25v6.524ZM6.75 4.75A2.25 2.25 0 0 0 4.504 2.5H1.5v7.95h3.757a3.75 3.75 0 0 1 2.651 1.094Z" />
              </svg>
              <span>Readme</span>
            </div>
            <div className="flex items-center gap-2">
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .375.65l2.5 1.5a.75.75 0 1 0 .75-1.3L8.75 7.85V4.75Z" />
              </svg>
              <span>Activity</span>
            </div>
            <div className="flex items-center gap-2">
              <span>★</span>
              <span className="text-white font-semibold">{selectedRepo.stars}</span> stars
            </div>
            <div className="flex items-center gap-2">
              <span>👁</span>
              <span className="text-white font-semibold">{selectedRepo.watching}</span> watching
            </div>
            <div className="flex items-center gap-2">
              <span>⑂</span>
              <span className="text-white font-semibold">{selectedRepo.forks}</span> forks
            </div>
          </div>
        </div>

        {/* Releases Card (With Download Links for APK!) */}
        <div className="space-y-3 pb-6 border-b border-[#30363D]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Releases</h3>
            <span className="px-1.5 py-0.2 rounded-full bg-[#238636] text-white text-[10px] font-bold">
              Latest
            </span>
          </div>

          <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D] space-y-2">
            <div className="font-bold text-[#58A6FF]">Quant v1.0 Universal APK</div>
            <p className="text-[11px] text-[#7D8590]">
              Native Android release with targetSdk 36 & Compose.
            </p>
            <div className="space-y-1 pt-1">
              <a
                href="https://raw.githubusercontent.com/quantrinitylab/Quant-Ecosystem/main/apk%20testing/Quant-v1.0-debug.apk"
                className="block text-[11px] text-[#FF8C42] hover:underline font-semibold"
              >
                📥 Quant-v1.0-debug.apk (11.39 MB)
              </a>
              <a
                href="https://raw.githubusercontent.com/quantrinitylab/Quant-Ecosystem/main/apk%20testing/quant-app.apk"
                className="block text-[11px] text-[#7D8590] hover:underline font-mono"
              >
                📦 quant-app.apk (Mirror)
              </a>
            </div>
          </div>
        </div>

        {/* Packages Card */}
        <div className="space-y-2 pb-6 border-b border-[#30363D]">
          <h3 className="font-bold text-sm text-white">Packages</h3>
          <p className="text-[11px] text-[#7D8590]">No published packages yet in registry.</p>
        </div>

        {/* Contributors Card */}
        <div className="space-y-3 pb-6 border-b border-[#30363D]">
          <h3 className="font-bold text-sm text-white">
            Contributors{' '}
            <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[#7D8590] text-[10px]">
              8
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {['K', 'A', 'S', 'F', 'R', 'P', 'L', 'D'].map((init, idx) => (
              <span
                key={idx}
                className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] text-[#E6EDF3] font-bold flex items-center justify-center text-[10px]"
              >
                {init}
              </span>
            ))}
          </div>
        </div>

        {/* Languages Card */}
        <div className="space-y-2">
          <h3 className="font-bold text-sm text-white">Languages</h3>
          <div className="h-2 rounded-full overflow-hidden flex">
            <div className="bg-[#3178C6] w-[84%]" title="TypeScript 84.2%" />
            <div className="bg-[#A97BFF] w-[8%]" title="Kotlin 8.1%" />
            <div className="bg-[#3572A5] w-[4%]" title="Python 4.3%" />
            <div className="bg-[#89E051] w-[2%]" title="Shell 2.1%" />
            <div className="bg-[#F1E05A] w-[2%]" title="Other 1.3%" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7D8590] pt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3178C6]" /> TypeScript 84.2%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#A97BFF]" /> Kotlin 8.1%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3572A5]" /> Python 4.3%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#89E051]" /> Shell 2.1%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
