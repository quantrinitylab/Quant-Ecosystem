// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Service
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
//
// Invariant 1: Project-isolated memories strictly belong to their projectId.
// Invariant 2: Project-isolated memories NEVER leak into cross-project queries.
// Invariant 3: DEFAULT mode allows shared cross-chat context, but cannot see
//              isolated memories from any PROJECT_ISOLATED workspace.
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
  customInstructions: string;
  memoryEntries: ProjectMemoryEntry[];
  memoryMode: ProjectMemoryMode;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectMemoryInput {
  projectId: string;
  workspaceId: string;
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
   * Get project memory by project ID.
   */
  getProjectMemory(projectId: string): ProjectMemory | undefined {
    const memory = this.projects.get(projectId);
    return memory ? this.clone(memory) : undefined;
  }

  /**
   * Update memory mode ('DEFAULT' vs 'PROJECT_ISOLATED').
   */
  updateMemoryMode(projectId: string, memoryMode: ProjectMemoryMode): ProjectMemory {
    const memory = this.projects.get(projectId);
    if (!memory) {
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
   * Update custom instructions / system prompt for the workspace.
   */
  updateCustomInstructions(projectId: string, customInstructions: string): ProjectMemory {
    const memory = this.projects.get(projectId);
    if (!memory) {
      throw new Error(`Project memory not found for project: ${projectId}`);
    }

    memory.customInstructions = customInstructions;
    memory.updatedAt = Date.now();
    return this.clone(memory);
  }

  /**
   * Add a new memory entry to the specified project.
   */
  addMemoryEntry(projectId: string, entry: AddMemoryEntryInput): ProjectMemoryEntry {
    const memory = this.projects.get(projectId);
    if (!memory) {
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
   * Remove a memory entry from the project.
   */
  removeMemoryEntry(projectId: string, entryId: string): boolean {
    const memory = this.projects.get(projectId);
    if (!memory) {
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
   * Toggle pinned state of a memory entry.
   */
  togglePin(projectId: string, entryId: string): ProjectMemoryEntry {
    const memory = this.projects.get(projectId);
    if (!memory) {
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
   * Query memories respecting strict enterprise isolation boundaries.
   *
   * Invariants:
   * 1. If `projectId` is provided:
   *    - If project is in `PROJECT_ISOLATED` mode:
   *      ONLY matching memories belonging to this project are returned.
   *      Zero memories from other projects or default global scope leak in.
   *    - If project is in `DEFAULT` mode:
   *      Returns matching memories from this project, plus memories from other
   *      projects whose mode is also `DEFAULT`.
   *      STRICT: Memories from any `PROJECT_ISOLATED` projects are NEVER included.
   *
   * 2. If `projectId` is omitted / cross-project query:
   *    - Returns matching memories from all projects configured in `DEFAULT` mode.
   *    - STRICT: Memories from any `PROJECT_ISOLATED` project NEVER leak.
   */
  queryMemories(query: string, projectId?: string): ProjectMemoryEntry[] {
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
      if (targetProject?.memoryMode === 'PROJECT_ISOLATED') {
        return targetProject.memoryEntries.filter(matchesFilter).map((e) => ({ ...e }));
      }

      // If target project is in DEFAULT mode (or not registered yet):
      const results: ProjectMemoryEntry[] = [];

      // Include target project entries first if it exists
      if (targetProject) {
        results.push(...targetProject.memoryEntries.filter(matchesFilter));
      }

      // Include other projects that are strictly in DEFAULT mode
      for (const [id, p] of this.projects.entries()) {
        if (id === projectId) continue;
        // Never leak memories from projects in PROJECT_ISOLATED mode!
        if (p.memoryMode === 'DEFAULT') {
          results.push(...p.memoryEntries.filter(matchesFilter));
        }
      }

      return results.map((e) => ({ ...e }));
    }

    // Cross-project query without a specific project context:
    // Only return entries from projects with DEFAULT mode. Isolated projects are never leaked.
    const results: ProjectMemoryEntry[] = [];
    for (const p of this.projects.values()) {
      if (p.memoryMode === 'DEFAULT') {
        results.push(...p.memoryEntries.filter(matchesFilter));
      }
    }

    return results.map((e) => ({ ...e }));
  }

  /**
   * Helper to list all project memories.
   */
  listProjects(): ProjectMemory[] {
    return Array.from(this.projects.values()).map((p) => this.clone(p));
  }

  /**
   * Delete an entire project memory workspace.
   */
  deleteProjectMemory(projectId: string): boolean {
    return this.projects.delete(projectId);
  }

  private clone(memory: ProjectMemory): ProjectMemory {
    return {
      ...memory,
      memoryEntries: memory.memoryEntries.map((e) => ({ ...e })),
    };
  }
}
