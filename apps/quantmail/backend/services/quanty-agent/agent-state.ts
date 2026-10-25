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
  //
  // Ownership is mandatory, not optional: this store is process-global, so
  // every record carries its owner's userId and every read is filtered by
  // the requesting userId (same rule as executor.liveStatus(userId)). A
  // caller with no tasks of their own sees an empty list, never a
  // neighbour's titles, URLs, thumbnails, or statuses. userId is a
  // required parameter on record/list/update so a future caller cannot
  // silently reintroduce the unscoped read — it fails typecheck.

  recordBrowserTask(input: {
    userId: string;
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

  /**
   * Update one of the CALLER's browser tasks. Returns null when the id is
   * unknown OR belongs to another user — a cross-user update must be
   * indistinguishable from a missing task, so Bob can neither flip Alice's
   * running task to done nor overwrite her title/thumbnail.
   */
  updateBrowserTask(id: string, userId: string, patch: Partial<Pick<QuantyBrowserTask, 'status' | 'thumbnailUrl' | 'title'>>): QuantyBrowserTask | null {
    const t = this.browserTasks.find((b) => b.id === id && b.userId === userId);
    if (!t) return null;
    Object.assign(t, patch);
    return { ...t };
  }

  /** The caller's own browser tasks, newest-first. Filter BEFORE slicing: slicing the global list first would hide a caller's tasks that sit behind another user's newer entries. */
  listBrowserTasks(userId: string, limit = 50): QuantyBrowserTask[] {
    return this.browserTasks.filter((t) => t.userId === userId).slice(0, limit).map((t) => ({ ...t }));
  }

  /**
   * Scoped browsing flag for GET /api/quanty/status: true only when the
   * CALLER has a running browser task. Scans the caller's owned records
   * directly (no limit window) so an older still-running task is not masked
   * by newer finished ones.
   */
  hasRunningBrowserTask(userId: string): boolean {
    return this.browserTasks.some((t) => t.userId === userId && t.status === 'running');
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
