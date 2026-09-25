// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Service
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
//
// Invariant 1: Project memories are strictly isolated to a specific projectId.
// Invariant 2: Project memories NEVER leak into global default user memories.
// Invariant 3: Project memories NEVER cross-pollinate across projects.
// Invariant 4: Cryptographic boundary verification (SHA-256 isolation hash).
// Invariant 5: Enterprise retention rules, sensitivity tagging, and export controls.
// ============================================================================

import { randomUUID, createHash } from 'node:crypto';

export type MemoryBoundaryScope = 'default' | 'project';
export type MemoryIsolationMode = 'PROJECT_ONLY' | 'UNIFIED';
export type RetentionPolicy = 'indefinite' | '30_days' | '90_days' | '1_year' | 'purge_on_close';
export type SensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'secret';
export type ComplianceStandard = 'SOC2' | 'HIPAA' | 'GDPR' | 'FINRA' | 'ISO27001' | 'PROPRIETARY';
export type MemoryCategory =
  | 'preference'
  | 'instruction'
  | 'fact'
  | 'code_snippet'
  | 'architecture'
  | 'decision';

export interface ProjectWorkspace {
  id: string;
  userId: string;
  name: string;
  description?: string;
  customInstructions?: string;
  color?: string;
  icon?: string;
  inheritDefaultMemory: boolean;
  memoryIsolationMode: MemoryIsolationMode;
  retentionPolicy: RetentionPolicy;
  sensitivityLevel: SensitivityLevel;
  complianceTags: ComplianceStandard[];
  dataResidency?: 'in-region-only' | 'global';
  exportRestrictions?: 'allowed' | 'restricted' | 'blocked';
  filesCount: number;
  memoryCount: number;
  pinnedFiles: ProjectFileAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  customInstructions?: string;
  color?: string;
  icon?: string;
  inheritDefaultMemory?: boolean;
  memoryIsolationMode?: MemoryIsolationMode;
  retentionPolicy?: RetentionPolicy;
  sensitivityLevel?: SensitivityLevel;
  complianceTags?: ComplianceStandard[];
  dataResidency?: 'in-region-only' | 'global';
  exportRestrictions?: 'allowed' | 'restricted' | 'blocked';
  pinnedFiles?: Array<{
    id?: string;
    name: string;
    size?: number;
    mimeType?: string;
    content?: string;
    contentSnippet?: string;
  }>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  customInstructions?: string;
  color?: string;
  icon?: string;
  inheritDefaultMemory?: boolean;
  memoryIsolationMode?: MemoryIsolationMode;
  retentionPolicy?: RetentionPolicy;
  sensitivityLevel?: SensitivityLevel;
  complianceTags?: ComplianceStandard[];
  exportRestrictions?: 'allowed' | 'restricted' | 'blocked';
}

export interface ProjectMemoryEntry {
  id: string;
  projectId: string; // 'default' for global user memory, or specific 'proj-uuid'
  userId: string;
  scope: MemoryBoundaryScope;
  category: MemoryCategory;
  content: string;
  source: string;
  sourceApp: string;
  sensitivity: SensitivityLevel;
  tags: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordMemoryInput {
  category?: MemoryCategory;
  content: string;
  source?: string;
  sourceApp?: string;
  sensitivity?: SensitivityLevel;
  tags?: string[];
  retentionDays?: number;
}

export interface ProjectFileAttachment {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string;
  content?: string;
  contentSnippet?: string;
  uploadedAt: string;
}

export interface AddProjectFileInput {
  id?: string;
  name: string;
  size?: number;
  mimeType?: string;
  content?: string;
  contentSnippet?: string;
}

export interface ProjectContextRetrieval {
  projectId: string;
  projectName: string;
  scope: 'project_isolated' | 'project_with_default_read_fallback';
  inheritDefaultMemory: boolean;
  memoryIsolationMode: MemoryIsolationMode;
  projectMemories: ProjectMemoryEntry[];
  defaultMemoriesIncluded: ProjectMemoryEntry[];
  systemInstructionsCombined: string;
  activeFiles: ProjectFileAttachment[];
  pinnedFiles: ProjectFileAttachment[];
  boundaryEnforced: boolean;
  isolationHash: string;
}

export interface ProjectContextExport {
  project: ProjectWorkspace;
  memories: ProjectMemoryEntry[];
  files: ProjectFileAttachment[];
  exportedAt: string;
  exportedBy: string;
  integrityHash: string;
}

export interface PurgeResult {
  projectId: string;
  purgedCount: number;
  purgedAt: string;
  status: 'PURGED';
}

export interface MemoryIsolationAudit {
  userId: string;
  projectId: string;
  projectMemoryCount: number;
  defaultMemoryCount: number;
  otherProjectsMemoryCount: number;
  leaksDetected: boolean;
  leakDetails: string[];
  status: 'ISOLATED' | 'LEAK_DETECTED';
}

export interface ProjectContextPrompt {
  customInstructions: string;
  pinnedFilesContext: string;
  isolationMode: MemoryIsolationMode;
}

export class ProjectBoundaryViolationError extends Error {
  readonly code = 'PROJECT_BOUNDARY_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectBoundaryViolationError';
  }
}

export class ProjectContextService {
  // In-memory persistent stores with strict namespace partitioning
  private projects: Map<string, ProjectWorkspace> = new Map();
  // Key: `${userId}:${projectId}` -> Array of memories
  private memoriesByProject: Map<string, ProjectMemoryEntry[]> = new Map();
  // Key: userId -> Array of global default memories
  private defaultMemories: Map<string, ProjectMemoryEntry[]> = new Map();
  // Key: `${userId}:${projectId}` -> Array of files
  private filesByProject: Map<string, ProjectFileAttachment[]> = new Map();

  constructor() {
    this.seedDefaultWorkspace();
  }

  private seedDefaultWorkspace() {}

  /**
   * Reset store (useful for test isolation).
   */
  clear(): void {
    this.projects.clear();
    this.memoriesByProject.clear();
    this.defaultMemories.clear();
    this.filesByProject.clear();
  }

  private computeProjectKey(userId: string, projectId: string): string {
    return `${userId}:${projectId}`;
  }

  private calculateExpiryDate(retention: RetentionPolicy, customDays?: number): string | undefined {
    if (customDays && customDays > 0) {
      const date = new Date();
      date.setDate(date.getDate() + customDays);
      return date.toISOString();
    }

    const now = new Date();
    switch (retention) {
      case '30_days':
        now.setDate(now.getDate() + 30);
        return now.toISOString();
      case '90_days':
        now.setDate(now.getDate() + 90);
        return now.toISOString();
      case '1_year':
        now.setFullYear(now.getFullYear() + 1);
        return now.toISOString();
      case 'purge_on_close':
        return undefined;
      case 'indefinite':
      default:
        return undefined;
    }
  }

  private isMemoryExpired(memory: ProjectMemoryEntry): boolean {
    if (!memory.expiresAt) return false;
    return new Date(memory.expiresAt).getTime() <= Date.now();
  }

  private resolveUserAndProjectId(
    param1: string,
    param2: string,
  ): { userId: string; projectId: string } {
    if (param2.startsWith('proj-') || (!param1.startsWith('proj-') && this.projects.has(param2))) {
      return { userId: param1, projectId: param2 };
    }
    return { userId: param2, projectId: param1 };
  }

  // ==========================================================================
  // Project Workspace Management
  // ==========================================================================

  createProject(userId: string, input: CreateProjectInput): ProjectWorkspace {
    if (!userId || !userId.trim()) {
      throw new ProjectBoundaryViolationError('UserId is required to create a project');
    }

    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new Error('Project name is required and cannot be empty');
    }
    if (trimmedName.length > 200) {
      throw new Error('Project name exceeds maximum length of 200 characters');
    }

    const projectId = `proj-${randomUUID()}`;
    const now = new Date().toISOString();

    const inheritDefault =
      input.memoryIsolationMode === 'UNIFIED' ? true : (input.inheritDefaultMemory ?? false);
    const isolationMode: MemoryIsolationMode =
      input.memoryIsolationMode ?? (inheritDefault ? 'UNIFIED' : 'PROJECT_ONLY');

    const project: ProjectWorkspace = {
      id: projectId,
      userId,
      name: trimmedName,
      description: input.description?.trim(),
      customInstructions: input.customInstructions?.trim(),
      color: input.color || '#58A6FF',
      icon: input.icon || '📁',
      inheritDefaultMemory: inheritDefault,
      memoryIsolationMode: isolationMode,
      retentionPolicy: input.retentionPolicy ?? 'indefinite',
      sensitivityLevel: input.sensitivityLevel ?? 'internal',
      complianceTags: input.complianceTags ?? ['PROPRIETARY'],
      dataResidency: input.dataResidency ?? 'global',
      exportRestrictions: input.exportRestrictions ?? 'allowed',
      filesCount: 0,
      memoryCount: 0,
      pinnedFiles: [],
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(projectId, project);
    this.memoriesByProject.set(this.computeProjectKey(userId, projectId), []);
    this.filesByProject.set(this.computeProjectKey(userId, projectId), []);

    if (input.pinnedFiles && Array.isArray(input.pinnedFiles)) {
      for (const pf of input.pinnedFiles) {
        this.addProjectFile(projectId, userId, pf);
      }
    }

    const files = this.filesByProject.get(this.computeProjectKey(userId, projectId)) || [];
    project.pinnedFiles = files;
    project.filesCount = files.length;

    return project;
  }

  getProject(param1: string, param2: string): ProjectWorkspace | undefined {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    if (project.userId !== userId) {
      return undefined;
    }
    const files = this.filesByProject.get(this.computeProjectKey(userId, projectId)) || [];
    project.pinnedFiles = files;
    project.filesCount = files.length;
    return project;
  }

  updateProject(
    param1: string,
    param2: string | UpdateProjectInput,
    param3?: UpdateProjectInput,
  ): ProjectWorkspace {
    let userId: string;
    let projectId: string;
    let input: UpdateProjectInput;

    if (typeof param2 === 'string') {
      const resolved = this.resolveUserAndProjectId(param1, param2);
      userId = resolved.userId;
      projectId = resolved.projectId;
      input = param3 || {};
    } else {
      projectId = param1;
      userId = (param3 as any) || '';
      input = param2 || {};
    }

    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error('Project name cannot be empty');
      project.name = trimmed;
    }
    if (input.description !== undefined) {
      project.description = input.description.trim();
    }
    if (input.customInstructions !== undefined) {
      project.customInstructions = input.customInstructions.trim();
    }
    if (input.color !== undefined) project.color = input.color;
    if (input.icon !== undefined) project.icon = input.icon;
    if (input.memoryIsolationMode !== undefined) {
      project.memoryIsolationMode = input.memoryIsolationMode;
      project.inheritDefaultMemory = input.memoryIsolationMode === 'UNIFIED';
    }
    if (input.inheritDefaultMemory !== undefined) {
      project.inheritDefaultMemory = input.inheritDefaultMemory;
      project.memoryIsolationMode = input.inheritDefaultMemory ? 'UNIFIED' : 'PROJECT_ONLY';
    }
    if (input.retentionPolicy !== undefined) {
      project.retentionPolicy = input.retentionPolicy;
    }
    if (input.sensitivityLevel !== undefined) {
      project.sensitivityLevel = input.sensitivityLevel;
    }
    if (input.complianceTags !== undefined) {
      project.complianceTags = input.complianceTags;
    }
    if (input.exportRestrictions !== undefined) {
      project.exportRestrictions = input.exportRestrictions;
    }

    project.updatedAt = new Date().toISOString();
    this.projects.set(projectId, project);
    return project;
  }

  listProjects(
    userId: string,
    filters?: {
      sensitivity?: SensitivityLevel;
      retention?: RetentionPolicy;
      search?: string;
    },
  ): ProjectWorkspace[] {
    const list: ProjectWorkspace[] = [];

    for (const project of this.projects.values()) {
      if (project.userId !== userId) continue;

      if (filters?.sensitivity && project.sensitivityLevel !== filters.sensitivity) {
        continue;
      }
      if (filters?.retention && project.retentionPolicy !== filters.retention) {
        continue;
      }
      if (filters?.search) {
        const query = filters.search.toLowerCase();
        const matchesName = project.name.toLowerCase().includes(query);
        const matchesDesc = project.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) continue;
      }

      const files = this.filesByProject.get(this.computeProjectKey(userId, project.id)) || [];
      project.pinnedFiles = files;
      project.filesCount = files.length;
      list.push(project);
    }

    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  deleteProject(param1: string, param2: string): boolean {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) return false;

    const key = this.computeProjectKey(userId, projectId);
    this.memoriesByProject.delete(key);
    this.filesByProject.delete(key);
    this.projects.delete(projectId);

    return true;
  }

  // ==========================================================================
  // Memory Isolation & Boundary Enforcement
  // ==========================================================================

  recordProjectMemory(
    projectId: string,
    userId: string,
    input: RecordMemoryInput,
  ): ProjectMemoryEntry {
    if (projectId === 'default') {
      throw new ProjectBoundaryViolationError(
        'Cannot record project memory into global default namespace. Use recordDefaultMemory instead.',
      );
    }

    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    const trimmedContent = input.content?.trim();
    if (!trimmedContent) {
      throw new Error('Memory content cannot be empty');
    }

    const now = new Date().toISOString();
    const expiresAt = this.calculateExpiryDate(project.retentionPolicy, input.retentionDays);

    const memory: ProjectMemoryEntry = {
      id: `mem-${randomUUID()}`,
      projectId,
      userId,
      scope: 'project',
      category: input.category ?? 'fact',
      content: trimmedContent,
      source: input.source || `project:${projectId}`,
      sourceApp: input.sourceApp || 'quantai',
      sensitivity: input.sensitivity ?? project.sensitivityLevel,
      tags: input.tags ?? ['project_memory'],
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    const key = this.computeProjectKey(userId, projectId);
    const existing = this.memoriesByProject.get(key) || [];
    existing.push(memory);
    this.memoriesByProject.set(key, existing);

    project.memoryCount = existing.length;
    project.updatedAt = now;
    this.projects.set(projectId, project);

    return memory;
  }

  recordDefaultMemory(userId: string, input: RecordMemoryInput): ProjectMemoryEntry {
    if (!userId || !userId.trim()) {
      throw new Error('UserId is required');
    }
    const trimmedContent = input.content?.trim();
    if (!trimmedContent) {
      throw new Error('Memory content cannot be empty');
    }

    const now = new Date().toISOString();
    const memory: ProjectMemoryEntry = {
      id: `mem-default-${randomUUID()}`,
      projectId: 'default',
      userId,
      scope: 'default',
      category: input.category ?? 'preference',
      content: trimmedContent,
      source: input.source || 'global:ecosystem',
      sourceApp: input.sourceApp || 'quantai',
      sensitivity: input.sensitivity ?? 'internal',
      tags: input.tags ?? ['global_memory'],
      createdAt: now,
      updatedAt: now,
    };

    const existing = this.defaultMemories.get(userId) || [];
    existing.push(memory);
    this.defaultMemories.set(userId, existing);

    return memory;
  }

  retrieveProjectContext(
    param1: string,
    param2: string,
    query?: { category?: MemoryCategory; search?: string },
  ): ProjectContextRetrieval {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    const key = this.computeProjectKey(userId, projectId);
    const rawMemories = this.memoriesByProject.get(key) || [];

    const validProjectMemories = rawMemories.filter((m) => {
      if (m.projectId !== projectId || m.userId !== userId || m.scope !== 'project') {
        return false;
      }
      return !this.isMemoryExpired(m);
    });

    let filteredProjectMemories = validProjectMemories;
    if (query?.category) {
      filteredProjectMemories = filteredProjectMemories.filter(
        (m) => m.category === query.category,
      );
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      filteredProjectMemories = filteredProjectMemories.filter(
        (m) =>
          m.content.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    let defaultMemoriesIncluded: ProjectMemoryEntry[] = [];
    if (project.inheritDefaultMemory) {
      const rawDefaults = this.defaultMemories.get(userId) || [];
      defaultMemoriesIncluded = rawDefaults.filter((m) => {
        return m.scope === 'default' && m.projectId === 'default' && !this.isMemoryExpired(m);
      });
      if (query?.category) {
        defaultMemoriesIncluded = defaultMemoriesIncluded.filter(
          (m) => m.category === query.category,
        );
      }
      if (query?.search) {
        const q = query.search.toLowerCase();
        defaultMemoriesIncluded = defaultMemoriesIncluded.filter((m) =>
          m.content.toLowerCase().includes(q),
        );
      }
    }

    const files = this.filesByProject.get(key) || [];

    const instructions: string[] = [];
    if (project.customInstructions) {
      instructions.push(`[PROJECT CUSTOM INSTRUCTIONS]: ${project.customInstructions}`);
    }
    instructions.push(
      `[ISOLATION BOUNDARY]: Project "${project.name}" (ID: ${project.id}). ` +
        `Memory Scope: ${project.inheritDefaultMemory ? 'Project + Global Read' : 'Project Isolated Only'}. ` +
        `Sensitivity: ${project.sensitivityLevel.toUpperCase()}.`,
    );

    const hash = createHash('sha256')
      .update(projectId)
      .update(userId)
      .update(project.inheritDefaultMemory ? 'inherit_true' : 'inherit_false')
      .update(filteredProjectMemories.map((m) => m.id).join(','))
      .digest('hex');

    return {
      projectId: project.id,
      projectName: project.name,
      scope: project.inheritDefaultMemory
        ? 'project_with_default_read_fallback'
        : 'project_isolated',
      inheritDefaultMemory: project.inheritDefaultMemory,
      memoryIsolationMode: project.memoryIsolationMode,
      projectMemories: filteredProjectMemories,
      defaultMemoriesIncluded,
      systemInstructionsCombined: instructions.join('\n\n'),
      activeFiles: files,
      pinnedFiles: files,
      boundaryEnforced: true,
      isolationHash: hash,
    };
  }

  purgeProjectMemory(
    param1: string,
    param2: string,
    options?: { retentionDays?: number },
  ): PurgeResult {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    const key = this.computeProjectKey(userId, projectId);
    const existing = this.memoriesByProject.get(key) || [];
    const purgedCount = existing.length;

    this.memoriesByProject.set(key, []);

    project.memoryCount = 0;
    project.updatedAt = new Date().toISOString();
    this.projects.set(projectId, project);

    return {
      projectId,
      purgedCount,
      purgedAt: new Date().toISOString(),
      status: 'PURGED',
    };
  }

  exportProjectContext(param1: string, param2: string): ProjectContextExport {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    if (project.exportRestrictions === 'blocked') {
      const err = new Error('Export blocked by enterprise compliance policy');
      (err as unknown as { statusCode: number; code: string }).statusCode = 403;
      (err as unknown as { statusCode: number; code: string }).code = 'EXPORT_RESTRICTED';
      throw err;
    }

    const key = this.computeProjectKey(userId, projectId);
    const memories = (this.memoriesByProject.get(key) || []).filter(
      (m) => !this.isMemoryExpired(m),
    );
    const files = this.filesByProject.get(key) || [];

    const integrityHash = createHash('sha256')
      .update(JSON.stringify({ project, memories, files }))
      .digest('hex');

    return {
      project,
      memories,
      files,
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      integrityHash,
    };
  }

  // ==========================================================================
  // Project File Attachment Management
  // ==========================================================================

  addProjectFile(
    param1: string,
    param2: string,
    fileInput: AddProjectFileInput,
  ): ProjectFileAttachment {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    const size =
      fileInput.size ?? (fileInput.content ? Buffer.byteLength(fileInput.content, 'utf8') : 0);

    const key = this.computeProjectKey(userId, projectId);
    const files = this.filesByProject.get(key) || [];

    // If file with same id exists, update it
    if (fileInput.id) {
      const existingIdx = files.findIndex((f) => f.id === fileInput.id);
      if (existingIdx !== -1) {
        const updatedFile: ProjectFileAttachment = {
          ...files[existingIdx]!,
          name: fileInput.name,
          size,
          mimeType: fileInput.mimeType || files[existingIdx]!.mimeType,
          content: fileInput.content,
          contentSnippet: fileInput.contentSnippet ?? fileInput.content,
        };
        files[existingIdx] = updatedFile;
        this.filesByProject.set(key, files);
        project.pinnedFiles = files;
        project.filesCount = files.length;
        project.updatedAt = new Date().toISOString();
        this.projects.set(projectId, project);
        return updatedFile;
      }
    }

    const file: ProjectFileAttachment = {
      id: fileInput.id || `file-${randomUUID()}`,
      projectId,
      userId,
      name: fileInput.name,
      size,
      mimeType: fileInput.mimeType || 'text/plain',
      content: fileInput.content,
      contentSnippet: fileInput.contentSnippet ?? fileInput.content,
      uploadedAt: new Date().toISOString(),
    };

    files.push(file);
    this.filesByProject.set(key, files);

    project.pinnedFiles = files;
    project.filesCount = files.length;
    project.updatedAt = new Date().toISOString();
    this.projects.set(projectId, project);

    return file;
  }

  addPinnedFile(
    userId: string,
    projectId: string,
    fileInput: AddProjectFileInput,
  ): ProjectWorkspace {
    this.addProjectFile(projectId, userId, fileInput);
    const project = this.getProject(projectId, userId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    return project;
  }

  removePinnedFile(userId: string, projectId: string, fileId: string): ProjectWorkspace {
    const deleted = this.deleteProjectFile(projectId, fileId, userId);
    if (!deleted) {
      throw new Error(`Pinned file ${fileId} not found in project ${projectId}`);
    }
    const project = this.getProject(projectId, userId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    return project;
  }

  listProjectFiles(param1: string, param2: string): ProjectFileAttachment[] {
    const { userId, projectId } = this.resolveUserAndProjectId(param1, param2);
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }
    const key = this.computeProjectKey(userId, projectId);
    return this.filesByProject.get(key) || [];
  }

  deleteProjectFile(param1: string, param2: string, param3?: string): boolean {
    let projectId: string;
    let fileId: string;
    let userId: string;

    if (param3 !== undefined) {
      projectId = param1;
      fileId = param2;
      userId = param3;
    } else {
      projectId = param1;
      fileId = param2;
      userId = '';
    }

    const project = this.projects.get(projectId);
    if (!project) return false;
    if (userId && project.userId !== userId) return false;

    const key = this.computeProjectKey(project.userId, projectId);
    const files = this.filesByProject.get(key) || [];
    const index = files.findIndex((f) => f.id === fileId);
    if (index === -1) return false;

    files.splice(index, 1);
    this.filesByProject.set(key, files);

    project.pinnedFiles = files;
    project.filesCount = files.length;
    project.updatedAt = new Date().toISOString();
    this.projects.set(projectId, project);

    return true;
  }

  // ==========================================================================
  // Prompt Generation Helper
  // ==========================================================================

  getProjectContextPrompt(userId: string, projectId: string): ProjectContextPrompt | null {
    const project = this.getProject(projectId, userId);
    if (!project) return null;

    const files = this.filesByProject.get(this.computeProjectKey(userId, projectId)) || [];
    const pinnedFilesContext = files
      .map(
        (f) =>
          `--- File: ${f.name} (${f.mimeType}, ${f.size} bytes) ---\n${f.content || f.contentSnippet || '[empty]'}`,
      )
      .join('\n\n');

    return {
      customInstructions: project.customInstructions || '',
      pinnedFilesContext,
      isolationMode: project.memoryIsolationMode,
    };
  }

  // ==========================================================================
  // Verification & Audit Methods
  // ==========================================================================

  verifyMemoryIsolation(userId: string, projectId: string): MemoryIsolationAudit {
    const project = this.getProject(projectId, userId);
    if (!project) {
      throw new Error(`Project ${projectId} not found or access denied`);
    }

    const projectKey = this.computeProjectKey(userId, projectId);
    const projectMems = this.memoriesByProject.get(projectKey) || [];
    const defaultMems = this.defaultMemories.get(userId) || [];

    const leaks: string[] = [];

    for (const mem of projectMems) {
      if (mem.scope !== 'project') {
        leaks.push(`Memory ${mem.id} in project ${projectId} has invalid scope '${mem.scope}'`);
      }
      if (mem.projectId !== projectId) {
        leaks.push(
          `Memory ${mem.id} in project ${projectId} has mismatched projectId '${mem.projectId}'`,
        );
      }
    }

    for (const mem of defaultMems) {
      if (mem.scope !== 'default' || mem.projectId !== 'default') {
        leaks.push(
          `Default memory ${mem.id} has invalid scope/projectId: ${mem.scope}/${mem.projectId}`,
        );
      }
    }

    let otherProjectsCount = 0;
    for (const [key, mems] of this.memoriesByProject.entries()) {
      if (key !== projectKey && key.startsWith(`${userId}:`)) {
        otherProjectsCount += mems.length;
      }
    }

    const hasLeaks = leaks.length > 0;

    return {
      userId,
      projectId,
      projectMemoryCount: projectMems.length,
      defaultMemoryCount: defaultMems.length,
      otherProjectsMemoryCount: otherProjectsCount,
      leaksDetected: hasLeaks,
      leakDetails: leaks,
      status: hasLeaks ? 'LEAK_DETECTED' : 'ISOLATED',
    };
  }
}

export const projectContextService = new ProjectContextService();
