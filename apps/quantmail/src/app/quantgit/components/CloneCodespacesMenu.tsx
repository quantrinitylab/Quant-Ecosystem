'use client';

// ============================================================================
// QuantGit — Dual-Tab Code Dropdown: Local Clone & Codespaces (Screens 111–114)
// ============================================================================

import React, { useState } from 'react';

export interface CloneCodespacesMenuProps {
  isOpen: boolean;
  onClose: () => void;
  repoOwner: string;
  repoName: string;
  currentBranch: string;
  onLaunchCodespace?: (branch: string) => void;
}

export const CloneCodespacesMenu: React.FC<CloneCodespacesMenuProps> = ({
  isOpen,
  onClose,
  repoOwner,
  repoName,
  currentBranch,
  onLaunchCodespace,
}) => {
  const [activeTab, setActiveTab] = useState<'local' | 'codespaces'>('local');
  const [cloneProtocol, setCloneProtocol] = useState<'https' | 'ssh' | 'cli'>('https');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cloneUrls = {
    https: `https://quantmail.in/git/${repoOwner}/${repoName}.git`,
    ssh: `git@quantmail.in:${repoOwner}/${repoName}.git`,
    cli: `quant repo clone ${repoOwner}/${repoName}`,
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = () => {
    window.location.href = `/api/repos/${repoOwner}/${repoName}/archive/zip?ref=${currentBranch}`;
  };

  return (
    <>
      {/* Invisible backdrop to dismiss when clicking outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      {/* Popover Menu Card */}
      <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl overflow-hidden z-50 text-xs text-[#E6EDF3] animate-in fade-in zoom-in-95 duration-100">
        {/* Top Tabs: Local vs Codespaces */}
        <div className="flex border-b border-[#30363D] bg-[#0D1117]">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-2.5 font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'local'
                ? 'border-[#F78166] text-[#E6EDF3]'
                : 'border-transparent text-[#8D96A0] hover:text-[#E6EDF3]'
            }`}
          >
            Local
          </button>
          <button
            onClick={() => setActiveTab('codespaces')}
            className={`flex-1 py-2.5 font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'codespaces'
                ? 'border-[#F78166] text-[#E6EDF3]'
                : 'border-transparent text-[#8D96A0] hover:text-[#E6EDF3]'
            }`}
          >
            Codespaces
          </button>
        </div>

        {/* Tab 1: Local Clone */}
        {activeTab === 'local' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-[#58A6FF]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Clone
              </span>
              <span className="text-[11px] text-[#8D96A0] hover:text-[#58A6FF] cursor-pointer">
                Which remote URL should I use?
              </span>
            </div>

            {/* Protocol Tabs (HTTPS, SSH, CLI) */}
            <div className="flex gap-1.5 bg-[#0D1117] p-1 rounded-lg border border-[#30363D]">
              <button
                onClick={() => setCloneProtocol('https')}
                className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                  cloneProtocol === 'https'
                    ? 'bg-[#21262D] text-[#E6EDF3] shadow-sm'
                    : 'text-[#8D96A0] hover:text-[#E6EDF3]'
                }`}
              >
                HTTPS
              </button>
              <button
                onClick={() => setCloneProtocol('ssh')}
                className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                  cloneProtocol === 'ssh'
                    ? 'bg-[#21262D] text-[#E6EDF3] shadow-sm'
                    : 'text-[#8D96A0] hover:text-[#E6EDF3]'
                }`}
              >
                SSH
              </button>
              <button
                onClick={() => setCloneProtocol('cli')}
                className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                  cloneProtocol === 'cli'
                    ? 'bg-[#21262D] text-[#E6EDF3] shadow-sm'
                    : 'text-[#8D96A0] hover:text-[#E6EDF3]'
                }`}
              >
                Quant CLI
              </button>
            </div>

            {/* Copyable Input */}
            <div className="relative flex items-center">
              <input
                type="text"
                readOnly
                value={cloneUrls[cloneProtocol]}
                className="w-full bg-[#0D1117] border border-[#30363D] rounded-md py-1.5 pl-3 pr-10 text-[11px] font-mono text-[#E6EDF3] outline-none select-all"
              />
              <button
                onClick={() => handleCopy(cloneUrls[cloneProtocol])}
                className="absolute right-1.5 p-1 rounded hover:bg-[#21262D] text-[#8D96A0] hover:text-[#E6EDF3] transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
                  <svg
                    className="w-3.5 h-3.5 text-[#3FB950]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#8D96A0]">
              {cloneProtocol === 'https' && 'Clone using the web URL.'}
              {cloneProtocol === 'ssh' && 'Use a password-protected SSH key.'}
              {cloneProtocol === 'cli' && 'Use the Quant official CLI.'}
            </p>

            <div className="pt-2 border-t border-[#30363D] space-y-1.5">
              <button
                onClick={() => alert(`Launching in Quant Copilot App...`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#21262D] text-left text-xs transition-colors"
              >
                <span className="text-base">🤖</span>
                <span className="font-medium text-[#E6EDF3]">Open in Quant Copilot App</span>
              </button>
              <button
                onClick={handleDownloadZip}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#21262D] text-left text-xs transition-colors"
              >
                <svg
                  className="w-4 h-4 text-[#8D96A0]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="font-medium text-[#E6EDF3]">Download ZIP</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Codespaces */}
        {activeTab === 'codespaces' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-xs text-[#E6EDF3]">Codespaces</h4>
                <p className="text-[11px] text-[#8D96A0]">
                  Your instant dev environment in the cloud
                </p>
              </div>
            </div>

            {/* Empty State */}
            <div className="p-4 rounded-lg bg-[#0D1117] border border-[#30363D] text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-[#21262D] mx-auto flex items-center justify-center text-sm">
                ☁️
              </div>
              <p className="font-medium text-xs text-[#E6EDF3]">No codespaces</p>
              <p className="text-[11px] text-[#8D96A0]">
                You don't have any codespaces with this repository checked out
              </p>
            </div>

            {/* Create Button */}
            <button
              onClick={() => {
                onLaunchCodespace?.(currentBranch);
                onClose();
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create codespace on {currentBranch}
            </button>

            {/* Sub-actions */}
            <div className="pt-2 border-t border-[#30363D] space-y-1">
              <button
                onClick={() => alert('Custom Codespace configuration options...')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#21262D] text-[11px] text-[#8D96A0] hover:text-[#E6EDF3] transition-colors"
              >
                <span>+ New with options...</span>
                <span>⚙️</span>
              </button>
              <button
                onClick={() => alert('Dev container config wizard...')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#21262D] text-[11px] text-[#8D96A0] hover:text-[#E6EDF3] transition-colors"
              >
                <span>Configure dev container</span>
                <span>📦</span>
              </button>
            </div>

            <div className="pt-2 border-t border-[#30363D] text-[10px] text-[#8D96A0] text-center">
              Codespace usage for this repository is paid for by{' '}
              <span className="text-[#E6EDF3] font-medium">{repoOwner}</span>.
            </div>
          </div>
        )}
      </div>
    </>
  );
};
