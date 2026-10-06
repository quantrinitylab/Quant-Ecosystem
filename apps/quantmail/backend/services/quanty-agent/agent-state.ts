/**
 * quanty-agent/agent-state.ts — Process-wide Quanty state beyond tasks:
 * approval history, browser-task history, and the soul/memory identity cards.
 *
 * Everything is in-memory by default (same seam philosophy as the task
 * store); a DB-backed implementation can replace this module later without
 * touching the routes.
 */

import { randomUUID } from 'node:crypto';
import type { QuantyApproval, QuantyBrowserTask, QuantyIdentity } from './types';

const MAX_ENTRIES = 200;

class QuantyAgentState {
  private approvals: QuantyApproval[] = [];
  private browserTasks: QuantyBrowserTask[] = [];
  private identity: QuantyIdentity = {
    soul: { title: 'Quanty Soul', updatedAt: new Date().toISOString() },
    memory: { title: 'Quanty Memory', updatedAt: new Date().toISOString() },
  };

  // -- Approvals -----------------------------------------------------------

  /** Record a permission grant. Called by the executor on confirm(approved=true). */
  logApproval(input: { icon: string; title: string; description: string; scope: string }): QuantyApproval {
    const entry: QuantyApproval = {
      id: randomUUID(),
      grantedAt: new Date().toISOString(),
      ...input,
    };
    this.approvals.unshift(entry);
    if (this.approvals.length > MAX_ENTRIES) this.approvals.length = MAX_ENTRIES;
    return entry;
  }

  listApprovals(limit = 50): QuantyApproval[] {
    return this.approvals.slice(0, limit).map((a) => ({ ...a }));
  }

  // -- Browser tasks --------------------------------------------------------

  recordBrowserTask(input: {
    title: string;
    url: string;
    thumbnailUrl?: string;
  }): QuantyBrowserTask {
    const task: QuantyBrowserTask = {
      id: randomUUID(),
      status: 'running',
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.browserTasks.unshift(task);
    if (this.browserTasks.length > MAX_ENTRIES) this.browserTasks.length = MAX_ENTRIES;
    return { ...task };
  }

  updateBrowserTask(id: string, patch: Partial<Pick<QuantyBrowserTask, 'status' | 'thumbnailUrl' | 'title'>>): QuantyBrowserTask | null {
    const t = this.browserTasks.find((b) => b.id === id);
    if (!t) return null;
    Object.assign(t, patch);
    return { ...t };
  }

  listBrowserTasks(limit = 50): QuantyBrowserTask[] {
    return this.browserTasks.slice(0, limit).map((t) => ({ ...t }));
  }

  // -- Identity -------------------------------------------------------------

  getIdentity(): QuantyIdentity {
    return {
      soul: { ...this.identity.soul },
      memory: { ...this.identity.memory },
    };
  }

  updateIdentity(patch: Partial<QuantyIdentity>): QuantyIdentity {
    if (patch.soul) this.identity.soul = { ...this.identity.soul, ...patch.soul, updatedAt: new Date().toISOString() };
    if (patch.memory) this.identity.memory = { ...this.identity.memory, ...patch.memory, updatedAt: new Date().toISOString() };
    return this.getIdentity();
  }

  /** Test-only reset. */
  clear(): void {
    this.approvals = [];
    this.browserTasks = [];
  }
}

export const quantyAgentState = new QuantyAgentState();
