'use client';

import React from 'react';
import type { FormEvent } from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import { BlobEditor, type CommitBlobInput } from '../../../components/BlobEditor';
import { BuildTerminal } from './BuildTerminal';
import type {
  ModalState,
  Repo,
  FileNode,
  PRItem,
  IssueItem,
  IssueCommentItem,
  WorkflowRunItem,
  DeployedAgent,
  CloneProtocol,
  AccessoryType,
} from '../types';

export interface QuantGitModalsProps {
  modalState: ModalState;
  setModalState: (modal: ModalState) => void;
  newBranchInput: string;
  setNewBranchInput: (val: string) => void;
  repoBranches: string[];
  currentBranch: string;
  setCurrentBranch: (val: string) => void;
  handleCreateBranch: () => void;
  fileSearchQuery: string;
  setFileSearchQuery: (val: string) => void;
  filteredFiles: FileNode[];
  setViewingFile: (file: FileNode | null) => void;
  viewingFile: FileNode | null;
  selectedRepo: Repo | null;
  cloneProtocol: CloneProtocol;
  setCloneProtocol: (p: CloneProtocol) => void;
  viewingBlobSha: string | null;
  closeBlobEditor: () => void;
  handleCommitBlob: (input: CommitBlobInput) => Promise<void>;
  selectedOfficeAgent: DeployedAgent | null;
  setSelectedOfficeAgent: (ag: DeployedAgent | null) => void;
  newIssueTitle: string;
  setNewIssueTitle: (val: string) => void;
  newIssueBody: string;
  setNewIssueBody: (val: string) => void;
  newIssueLabel: string;
  setNewIssueLabel: (val: string) => void;
  handleCreateIssue: (e: FormEvent) => void;
  newPrBranch: string;
  newPrTitle: string;
  setNewPrTitle: (val: string) => void;
  newPrBody: string;
  setNewPrBody: (val: string) => void;
  handleCreatePR: (e: FormEvent) => void;
  newRepoName: string;
  setNewRepoName: (val: string) => void;
  newRepoDesc: string;
  setNewRepoDesc: (val: string) => void;
  newRepoVisibility: 'public' | 'private';
  setNewRepoVisibility: (val: 'public' | 'private') => void;
  handleCreateRepo: (e: FormEvent) => void;
  newAgentName: string;
  setNewAgentName: (val: string) => void;
  newAgentRole: string;
  setNewAgentRole: (val: string) => void;
  newAgentPod: string;
  setNewAgentPod: (val: string) => void;
  handleDeployAgent: (e: FormEvent) => void;
  selectedActionRun: WorkflowRunItem | null;
  selectedPr: PRItem | null;
  closePullDetail: () => void;
  handleMergePR: (id: number) => void;
  selectedIssue: IssueItem | null;
  closeIssueDetail: () => void;
  issueComments: IssueCommentItem[];
  isLoadingComments: boolean;
  commentError: string | null;
  commentDraft: string;
  setCommentDraft: (val: string) => void;
  handleSubmitIssueComment: (e: FormEvent) => void;
  isSubmittingComment: boolean;
  handleToggleIssue: (id: number) => void;
  currentUsername: string;
  isPersonalizeOpen: boolean;
  setIsPersonalizeOpen: (open: boolean) => void;
  selectedAccessory: AccessoryType;
  setSelectedAccessory: (acc: AccessoryType) => void;
  quantyName: string;
  setQuantyName: (val: string) => void;
  quantyInstructions: string;
  setQuantyInstructions: (val: string) => void;
  showToast: (msg: string) => void;
}

export function QuantGitModals({
  modalState,
  setModalState,
  newBranchInput,
  setNewBranchInput,
  repoBranches,
  currentBranch,
  setCurrentBranch,
  handleCreateBranch,
  fileSearchQuery,
  setFileSearchQuery,
  filteredFiles,
  setViewingFile,
  viewingFile,
  selectedRepo,
  cloneProtocol,
  setCloneProtocol,
  viewingBlobSha,
  closeBlobEditor,
  handleCommitBlob,
  selectedOfficeAgent,
  setSelectedOfficeAgent,
  newIssueTitle,
  setNewIssueTitle,
  newIssueBody,
  setNewIssueBody,
  newIssueLabel,
  setNewIssueLabel,
  handleCreateIssue,
  newPrBranch,
  newPrTitle,
  setNewPrTitle,
  newPrBody,
  setNewPrBody,
  handleCreatePR,
  newRepoName,
  setNewRepoName,
  newRepoDesc,
  setNewRepoDesc,
  newRepoVisibility,
  setNewRepoVisibility,
  handleCreateRepo,
  newAgentName,
  setNewAgentName,
  newAgentRole,
  setNewAgentRole,
  newAgentPod,
  setNewAgentPod,
  handleDeployAgent,
  selectedActionRun,
  selectedPr,
  closePullDetail,
  handleMergePR,
  selectedIssue,
  closeIssueDetail,
  issueComments,
  isLoadingComments,
  commentError,
  commentDraft,
  setCommentDraft,
  handleSubmitIssueComment,
  isSubmittingComment,
  handleToggleIssue,
  currentUsername,
  isPersonalizeOpen,
  setIsPersonalizeOpen,
  selectedAccessory,
  setSelectedAccessory,
  quantyName,
  setQuantyName,
  quantyInstructions,
  setQuantyInstructions,
  showToast,
}: QuantGitModalsProps) {
  return (
    <>
      {/* Branch Switcher Modal */}
      {modalState === 'branch-switcher' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md overflow-hidden shadow-2xl space-y-3 p-4 text-xs animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <h3 className="font-bold text-white text-sm">Switch branches or tags</h3>
              <button
                type="button"
                onClick={() => {
                  setModalState('none');
                  setNewBranchInput('');
                }}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={newBranchInput}
              onChange={(e) => setNewBranchInput(e.target.value)}
              placeholder="Find or create a branch..."
              className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
            />
            {newBranchInput.trim() &&
              !repoBranches.some(
                (b) => b.toLowerCase() === newBranchInput.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onClick={handleCreateBranch}
                  className="w-full text-left py-2 px-3 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] font-semibold flex items-center gap-2 border border-[#30363D]"
                >
                  <span className="text-[#3FB950] font-bold">+</span>
                  <span>
                    Create branch: <span className="text-white">{newBranchInput.trim()}</span> from{' '}
                    <span className="text-[#7D8590]">{currentBranch}</span>
                  </span>
                </button>
              )}
            <div className="divide-y divide-[#21262D] max-h-60 overflow-y-auto">
              {repoBranches
                .filter((b) => b.toLowerCase().includes(newBranchInput.toLowerCase()))
                .map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setCurrentBranch(b);
                      setModalState('none');
                      setNewBranchInput('');
                      showToast(`Switched to branch ${b}`);
                    }}
                    className="w-full text-left py-2 px-2 hover:bg-[#21262D] flex items-center justify-between text-xs"
                  >
                    <span
                      className={
                        currentBranch === b ? 'text-[#FF8C42] font-bold' : 'text-[#E6EDF3]'
                      }
                    >
                      {b}
                    </span>
                    {currentBranch === b && <span className="text-[#FF8C42]">✓</span>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* File Finder Modal ('t') */}
      {modalState === 'file-finder' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-4 text-xs space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Go to file</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              placeholder="Type a filename..."
              autoFocus
              className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-3 py-2 text-xs text-white focus:outline-none"
            />
            <div className="divide-y divide-[#21262D] max-h-72 overflow-y-auto">
              {filteredFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => {
                    setModalState('none');
                    setViewingFile(file);
                  }}
                  className="w-full text-left py-2 px-2 hover:bg-[#21262D] flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-[#58A6FF]">{file.path}</span>
                  <span className="text-[#7D8590]">{file.size ?? 'dir'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clone Drawer Modal */}
      {modalState === 'clone' && selectedRepo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-4 text-xs space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Clone repository</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Protocol Tabs */}
            <div className="flex items-center gap-2 border-b border-[#21262D] pb-2">
              {(['https', 'ssh', 'cli'] as const).map((proto) => (
                <button
                  key={proto}
                  type="button"
                  onClick={() => setCloneProtocol(proto)}
                  className={`px-3 py-1 rounded font-bold uppercase text-[11px] ${
                    cloneProtocol === proto
                      ? 'bg-[#21262D] text-white border border-[#30363D]'
                      : 'text-[#7D8590]'
                  }`}
                >
                  {proto}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={
                  cloneProtocol === 'https'
                    ? selectedRepo.cloneUrl
                    : cloneProtocol === 'ssh'
                      ? selectedRepo.sshUrl
                      : `gh repo clone ${selectedRepo.fullName}`
                }
                className="flex-1 bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-[11px] font-mono text-white"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    cloneProtocol === 'https'
                      ? selectedRepo.cloneUrl
                      : cloneProtocol === 'ssh'
                        ? selectedRepo.sshUrl
                        : `gh repo clone ${selectedRepo.fullName}`,
                  );
                  showToast('Copied to clipboard!');
                }}
                className="px-3 py-1.5 rounded bg-[#21262D] hover:bg-[#30363D] font-bold text-white border border-[#30363D]"
              >
                Copy
              </button>
            </div>

            <div className="border-t border-[#21262D] pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => showToast('Starting ZIP download...')}
                className="text-[#58A6FF] hover:underline font-semibold flex items-center gap-1"
              >
                📥 Download ZIP
              </button>
              <button
                type="button"
                onClick={() => showToast('Opening in GitHub Desktop...')}
                className="text-[#7D8590] hover:text-white"
              >
                Open with GitHub Desktop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blob Editor Modal */}
      {viewingFile && selectedRepo && (
        <BlobEditor
          path={viewingFile.path}
          branch={currentBranch}
          availableBranches={repoBranches}
          initialContent={viewingFile.content ?? ''}
          expectedBlobSha={viewingBlobSha ?? ''}
          onClose={closeBlobEditor}
          onCommit={handleCommitBlob}
        />
      )}

      {/* Agent Dossier Modal */}
      {selectedOfficeAgent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-dossier-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
        >
          <section className="w-full max-w-lg overflow-hidden rounded-xl border border-[#30363D] bg-[#161B22] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#30363D] px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-full font-black text-black"
                  style={{
                    backgroundColor: selectedOfficeAgent.color,
                  }}
                >
                  {selectedOfficeAgent.initial}
                </span>
                <div>
                  <h2 id="agent-dossier-title" className="font-bold text-white">
                    {selectedOfficeAgent.name}
                  </h2>
                  <p className="text-xs text-[#7D8590]">{selectedOfficeAgent.role}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOfficeAgent(null)}
                aria-label="Close agent dossier"
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </header>

            <div className="space-y-4 p-5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                  <p className="text-[#7D8590]">Pod</p>
                  <p className="mt-1 font-mono font-bold text-white">{selectedOfficeAgent.pod}</p>
                </div>
                <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                  <p className="text-[#7D8590]">Status</p>
                  <p className="mt-1 font-bold capitalize text-[#3FB950]">
                    {selectedOfficeAgent.status}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                <p className="font-bold text-[#FF8C42]">Current assignment</p>
                <p className="mt-2 leading-relaxed text-[#E6EDF3]">
                  {selectedOfficeAgent.currentTask}
                </p>
              </div>

              <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                <p className="font-bold text-white">Live thought stream</p>
                <p className="mt-2 leading-relaxed text-[#7D8590]">
                  {selectedOfficeAgent.thoughts || 'Awaiting the next orchestrator instruction.'}
                </p>
              </div>

              {selectedOfficeAgent.steps && selectedOfficeAgent.steps.length > 0 && (
                <div>
                  <p className="mb-2 font-bold text-white">Recent execution</p>
                  <ul className="space-y-1.5 text-[#7D8590]">
                    {selectedOfficeAgent.steps.map((step) => (
                      <li key={step} className="flex gap-2">
                        <span className="text-[#3FB950]">✓</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedOfficeAgent(null);
                  setModalState('deploy-agent');
                }}
                className="w-full rounded-md bg-[#FF8C42] px-4 py-2 font-bold text-black hover:bg-[#ff9b5a]"
              >
                Assign a task
              </button>
            </div>
          </section>
        </div>
      )}

      {/* New Issue Modal */}
      {modalState === 'new-issue' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateIssue}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Create a new issue</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Title</label>
              <input
                type="text"
                required
                value={newIssueTitle}
                onChange={(e) => setNewIssueTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description</label>
              <textarea
                rows={4}
                value={newIssueBody}
                onChange={(e) => setNewIssueBody(e.target.value)}
                placeholder="Leave a comment or describe the bug..."
                className="w-full bg-[#0D1117] border border-[#30363D] rounded p-3 text-xs text-white"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <select
                value={newIssueLabel}
                onChange={(e) => setNewIssueLabel(e.target.value)}
                className="bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="bug">Label: bug</option>
                <option value="enhancement">enhancement</option>
                <option value="architecture">architecture</option>
              </select>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Submit new issue
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New PR Modal */}
      {modalState === 'new-pr' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePR}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Open a pull request</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-2 rounded bg-[#0D1117] border border-[#30363D] text-[11px] text-[#7D8590]">
              Comparing <span className="font-mono text-white">main</span> ←{' '}
              <span className="font-mono text-[#58A6FF]">{newPrBranch}</span>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Title</label>
              <input
                type="text"
                required
                value={newPrTitle}
                onChange={(e) => setNewPrTitle(e.target.value)}
                placeholder="Pull request title"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description</label>
              <textarea
                rows={3}
                value={newPrBody}
                onChange={(e) => setNewPrBody(e.target.value)}
                placeholder="Describe your changes and PR summary..."
                className="w-full bg-[#0D1117] border border-[#30363D] rounded p-3 text-xs text-white"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Create pull request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Repository Modal */}
      {modalState === 'new-repo' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRepo}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Create a new repository</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Repository name</label>
              <input
                type="text"
                required
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="my-awesome-app"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description (optional)</label>
              <input
                type="text"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={newRepoVisibility === 'public'}
                  onChange={() => setNewRepoVisibility('public')}
                />
                <span>Public</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={newRepoVisibility === 'private'}
                  onChange={() => setNewRepoVisibility('private')}
                />
                <span>Private</span>
              </label>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Create repository
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deploy Agent Modal */}
      {modalState === 'deploy-agent' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleDeployAgent}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Deploy Specialized Agent</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Agent Name</label>
              <input
                type="text"
                required
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Cipher"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Specialized Role</label>
              <input
                type="text"
                required
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
                placeholder="Cryptographic Audit & Secret Zeroing"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Pod</label>
              <select
                value={newAgentPod}
                onChange={(e) => setNewAgentPod(e.target.value)}
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="COMMAND">COMMAND (Executive Architecture)</option>
                <option value="SHIELD">SHIELD (Security & QA)</option>
                <option value="ENGINE">ENGINE (Fullstack Backend)</option>
                <option value="CANVAS">CANVAS (UI/UX Systems)</option>
              </select>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold"
              >
                Deploy to Swarm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Run Detail Flowchart Modal */}
      {modalState === 'action-detail' && selectedActionRun && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-4xl p-5 text-xs space-y-4 shadow-2xl animate-in fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[#3FB950] font-bold">✓</span>
                <h3 className="font-bold text-white text-sm">{selectedActionRun.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#161B22] p-3 rounded border border-[#30363D]">
              <div>
                <span className="text-[10px] text-[#7D8590]">Workflow</span>
                <p className="font-bold text-white">{selectedActionRun.workflow}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Branch</span>
                <p className="font-bold text-white">{selectedActionRun.branch}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Duration</span>
                <p className="font-bold text-white">{selectedActionRun.duration}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Commit</span>
                <p className="font-mono text-[#58A6FF]">{selectedActionRun.commitSha}</p>
              </div>
            </div>

            {/* Job Execution Flowchart */}
            <div className="space-y-2">
              <h4 className="font-bold text-white">Jobs Pipeline:</h4>
              <div className="space-y-2">
                {selectedActionRun.jobs.map((job) => (
                  <div
                    key={job.name}
                    className="flex items-center justify-between p-3 rounded bg-[#161B22] border border-[#30363D]"
                  >
                    <div className="flex items-center gap-2 font-bold text-white">
                      <span className="text-[#3FB950]">✓</span>
                      <span>{job.name}</span>
                    </div>
                    <span className="font-mono text-[#7D8590]">{job.duration}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live xterm.js Execution Terminal */}
            <div className="space-y-1.5 pt-2">
              <h4 className="font-bold text-white flex items-center justify-between text-xs">
                <span>Execution Logs (xterm.js):</span>
                <span className="text-[10px] text-[#7D8590] font-normal">
                  Live streaming via Redis PubSub
                </span>
              </h4>
              <BuildTerminal
                buildId={selectedActionRun.id}
                runName={selectedActionRun.name}
                height="280px"
              />
            </div>
          </div>
        </div>
      )}

      {/* Pull Request Detail Modal with Live Merge */}
      {modalState === 'pr-detail' && selectedPr && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl p-5 text-xs space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-start justify-between border-b border-[#21262D] pb-3 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-white text-base leading-tight">
                    {selectedPr.title}
                  </h3>
                  <span className="text-[#7D8590] text-sm">#{selectedPr.id}</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      selectedPr.state === 'merged'
                        ? 'bg-[#8957E5]/20 text-[#A371F7] border border-[#8957E5]/40'
                        : selectedPr.state === 'closed'
                          ? 'bg-[#DA3633]/20 text-[#F85149] border border-[#DA3633]/40'
                          : 'bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40'
                    }`}
                  >
                    <span>⑂</span>
                    <span className="capitalize">{selectedPr.state}</span>
                  </span>
                  <span className="text-[11px] text-[#7D8590]">
                    <span className="text-white font-semibold">{selectedPr.author}</span> wants to
                    merge into{' '}
                    <span className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#58A6FF] font-mono">
                      {selectedPr.branchTarget || selectedRepo?.defaultBranch || 'main'}
                    </span>{' '}
                    from{' '}
                    <span className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#58A6FF] font-mono">
                      {selectedPr.branchSource}
                    </span>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePullDetail}
                className="text-[#7D8590] hover:text-white text-base font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* PR Meta / Diff Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#161B22] p-3 rounded-md border border-[#30363D]">
              <div>
                <span className="text-[10px] text-[#7D8590]">Changes</span>
                <p className="font-bold text-white">
                  <span className="text-[#3FB950]">+{selectedPr.additions ?? 24}</span>{' '}
                  <span className="text-[#F85149]">-{selectedPr.deletions ?? 5}</span>
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Files Changed</span>
                <p className="font-bold text-white">{selectedPr.changedFiles ?? 3} files</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Created</span>
                <p className="font-bold text-white">{selectedPr.createdAt}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">CI Checks</span>
                <p className="font-bold text-[#3FB950]">✓ Passed</p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider">
                Description
              </h4>
              <div className="p-3.5 rounded-md bg-[#161B22] border border-[#30363D] text-[#E6EDF3] leading-relaxed whitespace-pre-wrap">
                {selectedPr.body || 'No description provided.'}
              </div>
            </div>

            {/* Merge Action Box */}
            <div className="pt-2">
              {selectedPr.state === 'open' ? (
                <div className="bg-[#161B22] border border-[#238636]/50 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[#3FB950] font-bold">
                      <span>✓</span>
                      <span>This branch has no conflicts with the base branch</span>
                    </div>
                    <p className="text-[11px] text-[#7D8590]">
                      Merging will record status to database and close this pull request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMergePR(selectedPr.id)}
                    className="px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    <span>⑂</span> Merge pull request
                  </button>
                </div>
              ) : selectedPr.state === 'merged' ? (
                <div className="bg-[#8957E5]/10 border border-[#8957E5]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#A371F7]">
                  <span className="font-bold text-base">✓</span>
                  <span className="font-semibold text-xs">
                    Pull request #{selectedPr.id} was successfully merged and closed.
                  </span>
                </div>
              ) : (
                <div className="bg-[#DA3633]/10 border border-[#DA3633]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#F85149]">
                  <span className="font-bold text-base">✕</span>
                  <span className="font-semibold text-xs">This pull request is closed.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Detail Modal with Live Toggle & Persisted Comments */}
      {modalState === 'issue-detail' && selectedIssue && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-detail-title"
            className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-start justify-between border-b border-[#21262D] pb-3 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="issue-detail-title"
                    className="font-bold text-white text-base leading-tight"
                  >
                    {selectedIssue.title}
                  </h3>
                  <span className="text-[#7D8590] text-sm">#{selectedIssue.id}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      selectedIssue.state === 'open'
                        ? 'bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40'
                        : 'bg-[#8957E5]/20 text-[#A371F7] border border-[#8957E5]/40'
                    }`}
                  >
                    <span>{selectedIssue.state === 'open' ? '⨀' : '✓'}</span>
                    <span className="capitalize">{selectedIssue.state}</span>
                  </span>
                  <span className="text-[11px] text-[#7D8590]">
                    Opened by{' '}
                    <span className="text-white font-semibold">{selectedIssue.author}</span> ·{' '}
                    {selectedIssue.createdAt}
                  </span>
                  {selectedIssue.labels?.map((lbl) => (
                    <span
                      key={lbl.name}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: lbl.color }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={closeIssueDetail}
                className="text-[#7D8590] hover:text-white text-base font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider">
                Issue Description
              </h4>
              <div className="p-3.5 rounded-md bg-[#161B22] border border-[#30363D] text-[#E6EDF3] leading-relaxed whitespace-pre-wrap">
                {selectedIssue.body || 'No description provided.'}
              </div>
            </div>

            {/* Persisted comments timeline */}
            <section aria-labelledby="issue-comments-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h4
                  id="issue-comments-heading"
                  className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider"
                >
                  Comments ({issueComments.length})
                </h4>
                {isLoadingComments && <span className="text-[#7D8590]">Loading…</span>}
              </div>

              {!isLoadingComments && issueComments.length === 0 && !commentError && (
                <div className="rounded-md border border-[#30363D] bg-[#161B22] p-4 text-center text-[#7D8590]">
                  No comments yet. Start the conversation.
                </div>
              )}

              <ol className="space-y-3">
                {issueComments.map((comment) => {
                  const authorName = comment.author.displayName || comment.author.username;
                  const initials = authorName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('');
                  const timestamp = new Date(comment.createdAt);
                  const formattedTimestamp = Number.isNaN(timestamp.getTime())
                    ? comment.createdAt
                    : new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(timestamp);

                  return (
                    <li key={comment.id} className="flex items-start gap-3">
                      {comment.author.avatarUrl ? (
                        <img
                          src={comment.author.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8 rounded-full border border-[#30363D] object-cover shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="size-8 rounded-full border border-[#30363D] bg-[#21262D] grid place-items-center text-[10px] font-bold text-[#E6EDF3] shrink-0"
                        >
                          {initials || '?'}
                        </div>
                      )}
                      <article className="min-w-0 flex-1 overflow-hidden rounded-md border border-[#30363D] bg-[#161B22]">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363D] bg-[#161B22] px-3 py-2">
                          <span className="font-semibold text-[#E6EDF3]">{authorName}</span>
                          <time dateTime={comment.createdAt} className="text-[10px] text-[#7D8590]">
                            {formattedTimestamp}
                          </time>
                        </header>
                        <p className="whitespace-pre-wrap break-words px-3 py-3 text-[#E6EDF3] leading-relaxed">
                          {comment.body}
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>

              <form onSubmit={handleSubmitIssueComment} className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="size-8 rounded-full border border-[#30363D] bg-[#21262D] grid place-items-center text-[10px] font-bold text-[#E6EDF3] shrink-0"
                >
                  {currentUsername.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label htmlFor="issue-comment-body" className="sr-only">
                    Add a comment
                  </label>
                  <textarea
                    id="issue-comment-body"
                    rows={4}
                    maxLength={10000}
                    required
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Leave a comment"
                    className="w-full resize-y rounded-md border border-[#30363D] bg-[#0D1117] p-3 text-xs text-[#E6EDF3] placeholder-[#7D8590] outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]"
                  />
                  {commentError && (
                    <p role="alert" className="text-[11px] text-[#F85149]">
                      {commentError}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[#7D8590]">
                      {commentDraft.length.toLocaleString()} / 10,000
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !commentDraft.trim()}
                      className="rounded-md bg-[#238636] px-4 py-2 font-bold text-white transition-colors hover:bg-[#2EA043] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmittingComment ? 'Commenting…' : 'Comment'}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Issue Actions Bar */}
            <div className="pt-2 flex items-center justify-between border-t border-[#21262D]">
              <span className="text-[11px] text-[#7D8590]">
                Assignee:{' '}
                <span className="text-white font-medium">{selectedIssue.assignee || 'None'}</span>
              </span>
              <button
                type="button"
                onClick={() => handleToggleIssue(selectedIssue.id)}
                className={`px-4 py-2 rounded-md font-bold text-xs flex items-center gap-1.5 shadow transition-colors ${
                  selectedIssue.state === 'open'
                    ? 'bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] border border-[#30363D]'
                    : 'bg-[#238636] hover:bg-[#2EA043] text-white'
                }`}
              >
                <span>{selectedIssue.state === 'open' ? '✓' : '⨀'}</span>
                <span>{selectedIssue.state === 'open' ? 'Close issue' : 'Reopen issue'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personalize Quanty AI Modal */}
      {isPersonalizeOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 text-xs space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🎨</span>
                <div>
                  <h3 className="font-bold text-white text-sm">Personalize your Quanty AI</h3>
                  <p className="text-[11px] text-[#7D8590]">
                    Customize accessory, name, and swarm instructions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalizeOpen(false)}
                className="text-[#7D8590] hover:text-white text-base font-bold"
              >
                ✕
              </button>
            </div>

            {/* Avatar Preview & Accessories */}
            <div className="flex flex-col items-center justify-center space-y-3 py-2 bg-[#0D1117] rounded-xl border border-[#21262D]">
              <div className="relative">
                <BubbleAvatar state="coding" size={64} />
                {selectedAccessory !== 'none' && (
                  <span className="absolute -top-2 -right-2 text-2xl drop-shadow-md">
                    {selectedAccessory === 'crown' && '👑'}
                    {selectedAccessory === 'firefighter' && '🚒'}
                    {selectedAccessory === 'mustache' && '🥸'}
                    {selectedAccessory === 'scarf' && '🧣'}
                    {selectedAccessory === 'flower' && '🌸'}
                    {selectedAccessory === 'pencil' && '✏️'}
                    {selectedAccessory === 'duck' && '🦆'}
                    {selectedAccessory === 'cowboy' && '🤠'}
                    {selectedAccessory === 'propeller' && '🚁'}
                  </span>
                )}
              </div>
              <span className="font-bold text-white text-sm">{quantyName}</span>
            </div>

            {/* Accessory Selector Grid */}
            <div className="space-y-2">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                Accessories
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: 'none', label: 'None', icon: '🚫' },
                  { id: 'crown', label: 'Crown', icon: '👑' },
                  { id: 'firefighter', label: 'Firefighter', icon: '🚒' },
                  { id: 'mustache', label: 'Mustache', icon: '🥸' },
                  { id: 'scarf', label: 'Scarf', icon: '🧣' },
                  { id: 'flower', label: 'Flower', icon: '🌸' },
                  { id: 'pencil', label: 'Pencil', icon: '✏️' },
                  { id: 'duck', label: 'Duck', icon: '🦆' },
                  { id: 'cowboy', label: 'Cowboy', icon: '🤠' },
                  { id: 'propeller', label: 'Propeller', icon: '🚁' },
                ].map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccessory(acc.id as any)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                      selectedAccessory === acc.id
                        ? 'bg-[#58A6FF]/20 border-[#58A6FF] text-white shadow-md'
                        : 'bg-[#0D1117] border-[#30363D] text-[#7D8590] hover:text-white hover:border-[#58A6FF]'
                    }`}
                  >
                    <span className="text-xl">{acc.icon}</span>
                    <span className="text-[10px] font-medium truncate w-full text-center">
                      {acc.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Name Input */}
            <div className="space-y-1">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                AI Name
              </label>
              <input
                type="text"
                value={quantyName}
                onChange={(e) => setQuantyName(e.target.value)}
                placeholder="Quanty"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
              />
            </div>

            {/* Custom Instructions Textarea */}
            <div className="space-y-1">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                Custom Instructions & Context
              </label>
              <textarea
                rows={3}
                value={quantyInstructions}
                onChange={(e) => setQuantyInstructions(e.target.value)}
                placeholder="What would you like Quanty to know about you to provide better responses? (e.g., Preferred tech stack, architecture constraints)"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#21262D]">
              <button
                type="button"
                onClick={() => setIsPersonalizeOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPersonalizeOpen(false);
                  showToast('Personalization preferences saved!');
                }}
                className="px-4 py-2 rounded-lg bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold shadow-md transition-colors"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
