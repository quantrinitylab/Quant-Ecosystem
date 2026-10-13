import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QuantGitModals, type QuantGitModalsProps } from '../components/QuantGitModals';
import type { DeployedAgent } from '../types';

// QM-SCREEN-013 R5 — "Agent Lab" honesty.
// R5-NEW-1 (P1): VIEW D `activeDeckTab === 'lab'` in page.tsx still framed the
// workspace as "Autonomous Swarm Fleet Command" with "live agent" subcopy, and
// AgentOfficeCanvas.tsx drew 'LIVE AUTONOMOUS WORKSPACE' on the canvas — while
// R4 had only renamed the AgentsTab instance. Agents are local-only
// placeholders; there is no agent backend and no autonomous capability.
// R5-NEW-2 (P2): the Agent Dossier Modal still rendered a "Live thought stream"
// box whose fallback ('Awaiting the next orchestrator instruction.') always
// displayed (no creation path ever sets thoughts), and Status rendered green
// (#3FB950) even for 'local-only' — contradicting R4's neutral-gray pill fix
// on the AgentsTab card.

const localAgent: DeployedAgent = {
  id: 'cipher',
  name: 'Cipher',
  role: 'Specialized Developer Agent',
  pod: 'COMMAND',
  status: 'local-only',
  currentTask: 'Local only — not connected to an agent backend.',
  initial: 'C',
  color: 'var(--app-accent)',
};

const noop = () => {};
const asyncNoop = async () => {};

const dossierProps: QuantGitModalsProps = {
  modalState: 'none',
  setModalState: noop,
  newBranchInput: '',
  setNewBranchInput: noop,
  repoBranches: [],
  currentBranch: '',
  setCurrentBranch: noop,
  handleCreateBranch: noop,
  fileSearchQuery: '',
  setFileSearchQuery: noop,
  filteredFiles: [],
  setViewingFile: noop,
  viewingFile: null,
  selectedRepo: null,
  viewingBlobSha: null,
  closeBlobEditor: noop,
  handleCommitBlob: asyncNoop,
  selectedOfficeAgent: localAgent,
  setSelectedOfficeAgent: noop,
  newIssueTitle: '',
  setNewIssueTitle: noop,
  newIssueBody: '',
  setNewIssueBody: noop,
  newIssueLabel: '',
  setNewIssueLabel: noop,
  handleCreateIssue: noop,
  newPrBranch: '',
  newPrTitle: '',
  setNewPrTitle: noop,
  newPrBody: '',
  setNewPrBody: noop,
  handleCreatePR: noop,
  newRepoName: '',
  setNewRepoName: noop,
  newRepoDesc: '',
  setNewRepoDesc: noop,
  newRepoVisibility: 'public',
  setNewRepoVisibility: noop,
  handleCreateRepo: noop,
  newAgentName: '',
  setNewAgentName: noop,
  newAgentRole: '',
  setNewAgentRole: noop,
  newAgentPod: '',
  setNewAgentPod: noop,
  handleDeployAgent: noop,
  selectedActionRun: null,
  selectedPr: null,
  closePullDetail: noop,
  handleMergePR: noop,
  selectedIssue: null,
  closeIssueDetail: noop,
  issueComments: [],
  isLoadingComments: false,
  commentError: null,
  commentDraft: '',
  setCommentDraft: noop,
  handleSubmitIssueComment: noop,
  isSubmittingComment: false,
  handleToggleIssue: noop,
  currentUsername: '',
  isPersonalizeOpen: false,
  setIsPersonalizeOpen: noop,
  selectedAccessory: 'none',
  setSelectedAccessory: noop,
  quantyName: '',
  setQuantyName: noop,
  quantyInstructions: '',
  setQuantyInstructions: noop,
  showToast: noop,
};

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

function renderDossier(agent: DeployedAgent | null): string {
  return renderToStaticMarkup(
    <QuantGitModals {...dossierProps} selectedOfficeAgent={agent} />,
  );
}

describe('Agent Lab (VIEW D) honesty (QM-SCREEN-013 R5)', () => {
  it('page.tsx VIEW D uses the honest Agent Workspace framing', () => {
    const page = readFileSync(srcPath('../page.tsx'), 'utf8');
    expect(page).not.toContain('Autonomous Swarm Fleet Command');
    expect(page).not.toContain('Select a live agent');
    expect(page).not.toContain('live agent on the operations floor');
    // Same honest framing R4 applied to AgentsTab.
    expect(page).toContain('Agent Workspace');
    expect(page).toContain('Local only — no backend connected');
    expect(page).toContain('local to this session');
  });

  it('AgentOfficeCanvas draws an honest canvas label, not LIVE AUTONOMOUS', () => {
    const canvas = readFileSync(
      srcPath('../../../components/AgentOfficeCanvas.tsx'),
      'utf8',
    );
    expect(canvas).not.toContain('LIVE AUTONOMOUS WORKSPACE');
    expect(canvas).toContain('LOCAL AGENT WORKSPACE');
  });

  it('the dossier modal has no Live thought stream box or orchestrator fallback', () => {
    const html = renderDossier(localAgent);
    expect(html).toContain('Cipher'); // modal rendered
    expect(html).not.toContain('Live thought stream');
    expect(html).not.toContain('Awaiting the next orchestrator instruction.');
    expect(html).not.toContain('thought stream');
  });

  it('the dossier modal shows a neutral-gray Local only status, never green', () => {
    const html = renderDossier(localAgent);
    expect(html).toContain('Local only');
    // No #3FB950 anywhere in the modal: the status is not green.
    expect(html).not.toContain('text-[#3FB950]');
    // Neutral gray like the R4 AgentsTab card pill.
    expect(html).toContain('text-[#8D96A0]');
  });
});
