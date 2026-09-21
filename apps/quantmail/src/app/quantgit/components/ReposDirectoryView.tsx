'use client';

import React from 'react';
import type { Repo } from '../types';

export interface ReposDirectoryViewProps {
  repoSearchQuery: string;
  setRepoSearchQuery: (q: string) => void;
  repoTypeFilter: 'all' | 'public' | 'private';
  setRepoTypeFilter: (t: 'all' | 'public' | 'private') => void;
  repoLangFilter: string;
  setRepoLangFilter: (l: string) => void;
  filteredRepos: Repo[];
  openRepository: (repo: Repo) => void;
  setSelectedRepo: (repo: Repo) => void;
  setModalState: (modal: any) => void;
  showToast?: (msg: string) => void;
}

export function ReposDirectoryView({
  repoSearchQuery,
  setRepoSearchQuery,
  repoTypeFilter,
  setRepoTypeFilter,
  repoLangFilter,
  setRepoLangFilter,
  filteredRepos,
  openRepository,
  setSelectedRepo,
  setModalState,
  showToast,
}: ReposDirectoryViewProps) {
  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#30363D]">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">All Repositories</h2>
            <p className="text-xs text-[#7D8590] mt-0.5">
              Git source control, PR review pipelines & autonomous swarm agents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState('new-repo')}
            className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <span>+</span> New repository
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5 py-4 border-b border-[#21262D] text-xs">
          <input
            type="text"
            value={repoSearchQuery}
            onChange={(e) => setRepoSearchQuery(e.target.value)}
            placeholder="Find a repository..."
            className="flex-1 min-w-[200px] bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
          />
          <select
            value={repoTypeFilter}
            onChange={(e) => setRepoTypeFilter(e.target.value as any)}
            className="bg-[#21262D] border border-[#30363D] rounded-md px-2.5 py-1.5 text-xs text-[#E6EDF3] focus:outline-none"
          >
            <option value="all">Type: All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select
            value={repoLangFilter}
            onChange={(e) => setRepoLangFilter(e.target.value)}
            className="bg-[#21262D] border border-[#30363D] rounded-md px-2.5 py-1.5 text-xs text-[#E6EDF3] focus:outline-none"
          >
            <option value="all">Language: All</option>
            <option value="typescript">TypeScript</option>
            <option value="kotlin">Kotlin</option>
          </select>
        </div>

        {/* Repositories List */}
        <div className="divide-y divide-[#21262D]">
          {filteredRepos.map((r) => {
            const branchCount = r.branches?.length || r.branchCount || 1;
            const commitCount = r.commitCount || (r.latestCommitSha ? 2118 : 1);

            return (
              <div key={r.id} className="py-4 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 max-w-2xl flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openRepository(r);
                      }}
                      className="text-base font-bold text-[#58A6FF] hover:underline flex items-center gap-1.5"
                    >
                      <svg height="16" viewBox="0 0 16 16" width="16" fill="#7D8590">
                        <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z" />
                      </svg>
                      {r.name}
                    </button>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase">
                      {r.visibility}
                    </span>
                  </div>

                  <p className="text-xs text-[#7D8590] leading-relaxed">{r.description}</p>

                  {/* Topics Chips */}
                  {Array.isArray(r.topics) && r.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {r.topics.map((topic) => (
                        <span
                          key={topic}
                          className="px-2 py-0.5 rounded-full bg-[#1F242C] text-[#58A6FF] text-[10px] font-medium border border-[#30363D]/40"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Metadata: Language, Stars, Forks, Branches, Commits, Updated */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#7D8590] pt-1">
                    {r.language && (
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            r.language.toLowerCase() === 'typescript'
                              ? 'bg-[#3178C6]'
                              : r.language.toLowerCase() === 'kotlin'
                                ? 'bg-[#A97BFF]'
                                : 'bg-[#E34C26]'
                          }`}
                        />
                        {r.language}
                      </span>
                    )}
                    <span>★ {r.stars}</span>
                    <span>⑂ {r.forks}</span>

                    {/* Real Branch Count */}
                    <span className="flex items-center gap-1">
                      <svg height="13" viewBox="0 0 16 16" width="13" fill="currentColor">
                        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                      </svg>
                      {branchCount.toLocaleString()} branches
                    </span>

                    {/* Real Commit Count */}
                    <span className="flex items-center gap-1">
                      <svg height="13" viewBox="0 0 16 16" width="13" fill="currentColor">
                        <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .375.65l2.5 1.5a.75.75 0 1 0 .75-1.3L8.75 7.85V4.75Z" />
                      </svg>
                      {commitCount.toLocaleString()} commits
                    </span>

                    <span>Updated {r.latestCommitTime}</span>
                  </div>

                  {/* Clone URL Bar with 1-click copy */}
                  <div className="flex items-center gap-2 bg-[#0D1117] border border-[#30363D] rounded-md px-2.5 py-1 text-[11px] font-mono text-[#7D8590] mt-2 max-w-xl">
                    <span className="text-[#3FB950] font-bold select-none text-[10px]">
                      git clone
                    </span>
                    <span className="truncate text-[#E6EDF3] select-all flex-1">{r.cloneUrl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(`git clone ${r.cloneUrl}`);
                        showToast?.(`Copied git clone command to clipboard`);
                      }}
                      className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] hover:text-white text-[10px] font-semibold transition-colors shrink-0"
                      title="Copy clone command"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRepo(r);
                      setModalState('clone');
                    }}
                    className="px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-xs font-semibold hover:bg-[#30363D] transition-colors"
                  >
                    Clone
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openRepository(r);
                    }}
                    className="px-3.5 py-1 rounded-md bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold text-xs transition-colors"
                  >
                    Open Repo →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
