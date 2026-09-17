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
          {filteredRepos.map((r) => (
            <div key={r.id} className="py-4 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      openRepository(r);
                    }}
                    className="text-base font-bold text-[#58A6FF] hover:underline"
                  >
                    {r.name}
                  </button>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase">
                    {r.visibility}
                  </span>
                </div>
                <p className="text-xs text-[#7D8590] leading-relaxed">{r.description}</p>
                <div className="flex items-center gap-4 text-xs text-[#7D8590] pt-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${r.language === 'TypeScript' ? 'bg-[#3178C6]' : 'bg-[#A97BFF]'}`}
                    />
                    {r.language}
                  </span>
                  <span>★ {r.stars}</span>
                  <span>⑂ {r.forks}</span>
                  <span>Updated {r.latestCommitTime}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
          ))}
        </div>
      </div>
    </div>
  );
}
