// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Service
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
//
// Invariant 1: Project-isolated memories strictly belong to their projectId.
// Invariant 2: Project-isolated memories NEVER leak into cross-project queries.
// Invariant 3: DEFAULT mode allows shared cross-chat context, but cannot see
//              isolated memories from any PROJECT_ISOLATED workspace.
// Invariant 4: User ownership — a row is visible only when
//              row.ownerId === caller ownerId (strict equality). Routes
//              always pass request.auth.userId (401 when absent), so via HTTP
//              only the owner sees a row and legacy (ownerless) rows 404.
//              Direct service calls without an ownerId retain legacy access
//              ONLY to ownerless rows (existing direct-service tests keep
//              working); they can never see owned rows.
// ============================================================================

import { randomUUID } from 'node:crypto';

export type ProjectMemoryMode = 'DEFAULT' | 'PROJECT_ISOLATED';

export interface ProjectMemoryEntry {
  id: string;
  content: string;
  category: string;
  createdAt: number;
  isPinned: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectMemory {
  projectId: string;
  workspaceId: string;
  /**
   * Owning userId. Absent = legacy (pre-ownership) row: unreachable via HTTP
   * (routes always pass a real userId) and visible to direct service calls
   * only when no ownerId is supplied (backward compat for existing tests).
   */
  ownerId?: string;
  customInstructions: string;
  memoryEntries: ProjectMemoryEntry[];
  memoryMode: ProjectMemoryMode;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectMemoryInput {
  projectId: string;
  workspaceId: string;
  /** Owning userId. Omitted = legacy (ownerless) row. Routes always pass it. */
  ownerId?: string;
  customInstructions?: string;
  memoryMode?: ProjectMemoryMode;
  initialEntries?: Array<{
    content: string;
    category?: string;
    isPinned?: boolean;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AddMemoryEntryInput {
  content: string;
  category?: string;
  isPinned?: boolean;
  metadata?: Record<string, unknown>;
}

export class ProjectMemoryService {
  private projects = new Map<string, ProjectMemory>();

  /**
   * Reset store (useful for clean test isolation).
   */
  clear(): void {
    this.projects.clear();
  }

  /**
   * Ownership visibility (strict equality). See Invariant 4.
   */
  private isVisible(memory: ProjectMemory, ownerId?: string): boolean {
    return memory.ownerId === ownerId;
  }

  /**
   * Existence check only — never returns data. Routes use it solely to
   * decide 404 (foreign row) vs auto-create (new row); the result itself
   * is never sent to clients.
   */
  exists(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  /**
   * Create a new project memory workspace context.
   */
  createProjectMemory(input: CreateProjectMemoryInput): ProjectMemory {
    if (!input.projectId || !input.projectId.trim()) {
      throw new Error('projectId is required');
    }
    if (!input.workspaceId || !input.workspaceId.trim()) {
      throw new Error('workspaceId is required');
    }
    if (this.projects.has(input.projectId)) {
      throw new Error(`Project memory for project '${input.projectId}' already exists`);
    }

    const now = Date.now();
    const initialEntries: ProjectMemoryEntry[] = (input.initialEntries ?? []).map((e) => ({
      id: `mem_${randomUUID()}`,
      content: e.content.trim(),
      category: e.category?.trim() || 'general',
      createdAt: now,
      isPinned: Boolean(e.isPinned),
      metadata: e.metadata,
    }));

    const memory: ProjectMemory = {
      projectId: input.projectId.trim(),
      workspaceId: input.workspaceId.trim(),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      customInstructions: input.customInstructions?.trim() ?? '',
      memoryEntries: initialEntries,
      memoryMode: input.memoryMode ?? 'DEFAULT',
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(memory.projectId, memory);
    return this.clone(memory);
  }

  /**
   * Get project memory by project ID, owner-scoped.
   * Returns undefined when the row is missing OR not owned by ownerId
   * (same result for both — no existence leak for foreign ids).
   */
  getProjectMemory(projectId: string, ownerId?: string): ProjectMemory | undefined {
    const memory = this.projects.get(projectId);
    return memory && this.isVisible(memory, ownerId) ? this.clone(memory) : undefined;
  }

  /**
   * Update memory mode ('DEFAULT' vs 'PROJECT_ISOLATED'), owner-scoped.
   */
  updateMemoryMode(
    projectId: string,
    memoryMode: ProjectMemoryMode,
    ownerId?: string,
  ): ProjectMemory {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }
    if (memoryMode !== 'DEFAULT' && memoryMode !== 'PROJECT_ISOLATED') {
      throw new Error(`Invalid memoryMode: ${memoryMode}. Must be 'DEFAULT' or 'PROJECT_ISOLATED'`);
    }

    memory.memoryMode = memoryMode;
    memory.updatedAt = Date.now();
    return this.clone(memory);
  }

  /**
   * Update custom instructions / system prompt for the workspace, owner-scoped.
   */
  updateCustomInstructions(
    projectId: string,
    customInstructions: string,
    ownerId?: string,
  ): ProjectMemory {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }

    memory.customInstructions = customInstructions;
    memory.updatedAt = Date.now();
    return this.clone(memory);
  }

  /**
   * Add a new memory entry to the specified project, owner-scoped.
   */
  addMemoryEntry(
    projectId: string,
    entry: AddMemoryEntryInput,
    ownerId?: string,
  ): ProjectMemoryEntry {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }
    if (!entry.content || !entry.content.trim()) {
      throw new Error('Memory content cannot be empty');
    }

    const newEntry: ProjectMemoryEntry = {
      id: `mem_${randomUUID()}`,
      content: entry.content.trim(),
      category: entry.category?.trim() || 'general',
      createdAt: Date.now(),
      isPinned: Boolean(entry.isPinned),
      metadata: entry.metadata,
    };

    memory.memoryEntries.push(newEntry);
    memory.updatedAt = Date.now();
    return { ...newEntry };
  }

  /**
   * Remove a memory entry from the project, owner-scoped.
   */
  removeMemoryEntry(projectId: string, entryId: string, ownerId?: string): boolean {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }

    const initialLength = memory.memoryEntries.length;
    memory.memoryEntries = memory.memoryEntries.filter((e) => e.id !== entryId);

    if (memory.memoryEntries.length < initialLength) {
      memory.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Toggle pinned state of a memory entry, owner-scoped.
   */
  togglePin(projectId: string, entryId: string, ownerId?: string): ProjectMemoryEntry {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }

    const entry = memory.memoryEntries.find((e) => e.id === entryId);
    if (!entry) {
      throw new Error(`Memory entry '${entryId}' not found in project '${projectId}'`);
    }

    entry.isPinned = !entry.isPinned;
    memory.updatedAt = Date.now();
    return { ...entry };
  }

  /**
   * Query memories respecting strict enterprise isolation boundaries,
   * additionally restricted to rows owned by ownerId (Invariant 4).
   *
   * Invariants:
   * 1. If `projectId` is provided:
   *    - If project is in `PROJECT_ISOLATED` mode:
   *      ONLY matching memories belonging to this project are returned,
   *      and only when the project is visible to ownerId.
   *      Zero memories from other projects or default global scope leak in.
   *    - If project is in `DEFAULT` mode (or not registered yet):
   *      Returns matching memories from this project, plus memories from
   *      other projects whose mode is also `DEFAULT` — in both cases only
   *      rows visible to ownerId.
   *      STRICT: Memories from any `PROJECT_ISOLATED` projects are NEVER included.
   *
   * 2. If `projectId` is omitted / cross-project query:
   *    - Returns matching memories from all projects configured in `DEFAULT` mode
   *      that are visible to ownerId.
   *    - STRICT: Memories from any `PROJECT_ISOLATED` project NEVER leak.
   */
  queryMemories(query: string, projectId?: string, ownerId?: string): ProjectMemoryEntry[] {
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const isWildcard = !normalizedQuery || normalizedQuery === '*';

    const matchesFilter = (entry: ProjectMemoryEntry): boolean => {
      if (isWildcard) return true;
      return (
        entry.content.toLowerCase().includes(normalizedQuery) ||
        entry.category.toLowerCase().includes(normalizedQuery)
      );
    };

    if (projectId) {
      const targetProject = this.projects.get(projectId);

      // If target project is isolated, strictly return only its own matching entries
      // — and only when it is visible to the caller.
      if (targetProject?.memoryMode === 'PROJECT_ISOLATED') {
        if (!this.isVisible(targetProject, ownerId)) {
          return [];
        }
        return targetProject.memoryEntries.filter(matchesFilter).map((e) => ({ ...e }));
      }

      // If target project is in DEFAULT mode (or not registered yet):
      const results: ProjectMemoryEntry[] = [];

      // Include target project entries first if it exists and is visible
      if (targetProject && this.isVisible(targetProject, ownerId)) {
        results.push(...targetProject.memoryEntries.filter(matchesFilter));
      }

      // Include other projects that are strictly in DEFAULT mode and visible
      for (const [id, p] of this.projects.entries()) {
        if (id === projectId) continue;
        // Never leak memories from projects in PROJECT_ISOLATED mode!
        if (p.memoryMode === 'DEFAULT' && this.isVisible(p, ownerId)) {
          results.push(...p.memoryEntries.filter(matchesFilter));
        }
      }

      return results.map((e) => ({ ...e }));
    }

    // Cross-project query without a specific project context:
    // Only return entries from projects with DEFAULT mode that are visible.
    const results: ProjectMemoryEntry[] = [];
    for (const p of this.projects.values()) {
      if (p.memoryMode === 'DEFAULT' && this.isVisible(p, ownerId)) {
        results.push(...p.memoryEntries.filter(matchesFilter));
      }
    }

    return results.map((e) => ({ ...e }));
  }

  /**
   * Helper to list project memories visible to ownerId.
   * Without ownerId, only ownerless (legacy) rows are listed.
   */
  listProjects(ownerId?: string): ProjectMemory[] {
    return Array.from(this.projects.values())
      .filter((p) => this.isVisible(p, ownerId))
      .map((p) => this.clone(p));
  }

  /**
   * Delete an entire project memory workspace, owner-scoped.
   * Returns false when the row is missing OR not owned by ownerId.
   */
  deleteProjectMemory(projectId: string, ownerId?: string): boolean {
    const memory = this.projects.get(projectId);
    if (!memory || !this.isVisible(memory, ownerId)) {
      return false;
    }
    return this.projects.delete(projectId);
  }

  private clone(memory: ProjectMemory): ProjectMemory {
    return {
      ...memory,
      memoryEntries: memory.memoryEntries.map((e) => ({ ...e })),
    };
  }
}
