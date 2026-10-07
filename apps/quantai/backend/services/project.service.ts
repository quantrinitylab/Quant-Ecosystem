// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Service
//
// Manages project workspace boundaries, custom instructions, pinned files,
// and memory isolation policy (PROJECT_ONLY vs UNIFIED).
// ============================================================================

import { randomUUID } from 'node:crypto';

export type MemoryIsolationMode = 'PROJECT_ONLY' | 'UNIFIED';

export interface PinnedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  content?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  customInstructions?: string;
  memoryIsolationMode: MemoryIsolationMode;
  pinnedFiles: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    content?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  customInstructions?: string;
  memoryIsolationMode?: MemoryIsolationMode;
  pinnedFiles?: Array<{
    id?: string;
    name: string;
    size?: number;
    mimeType?: string;
    content?: string;
  }>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  customInstructions?: string;
  memoryIsolationMode?: MemoryIsolationMode;
}

export interface ProjectContextPrompt {
  customInstructions: string;
  pinnedFilesContext: string;
  isolationMode: MemoryIsolationMode;
}

export class ProjectService {
  private projects = new Map<string, Project>();

  /**
   * Reset the store (useful for test isolation).
   */
  clear(): void {
    this.projects.clear();
  }

  /**
   * Create a new project workspace.
   */
  async createProject(userId: string, input: CreateProjectInput): Promise<Project> {
    if (!userId) {
      throw new Error('userId is required to create a project');
    }

    if (!input.name || !input.name.trim()) {
      throw new Error('Project name is required');
    }

    const id = `proj-${randomUUID()}`;
    const nowIso = new Date().toISOString();

    const pinnedFiles: PinnedFile[] = (input.pinnedFiles ?? []).map((file) => ({
      id: file.id || `file-${randomUUID()}`,
      name: file.name,
      size: file.size ?? (file.content ? Buffer.byteLength(file.content, 'utf8') : 0),
      mimeType: file.mimeType || 'text/plain',
      content: file.content,
    }));

    const project: Project = {
      id,
      userId,
      name: input.name.trim(),
      description: input.description?.trim(),
      customInstructions: input.customInstructions?.trim(),
      memoryIsolationMode: input.memoryIsolationMode ?? 'PROJECT_ONLY',
      pinnedFiles,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.projects.set(id, project);
    return { ...project, pinnedFiles: [...project.pinnedFiles] };
  }

  /**
   * Retrieve a project workspace by id ensuring user ownership.
   */
  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;
    if (project.userId !== userId) return null;
    return { ...project, pinnedFiles: [...project.pinnedFiles] };
  }

  /**
   * List all projects belonging to a user.
   */
  async listProjects(userId: string): Promise<Project[]> {
    const userProjects: Project[] = [];
    for (const project of this.projects.values()) {
      if (project.userId === userId) {
        userProjects.push({ ...project, pinnedFiles: [...project.pinnedFiles] });
      }
    }
    return userProjects.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /**
   * Update project workspace metadata, instructions, or memory isolation mode.
   */
  async updateProject(
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new Error('Project name cannot be empty');
      }
      project.name = input.name.trim();
    }

    if (input.description !== undefined) {
      project.description = input.description.trim();
    }

    if (input.customInstructions !== undefined) {
      project.customInstructions = input.customInstructions.trim();
    }

    if (input.memoryIsolationMode !== undefined) {
      project.memoryIsolationMode = input.memoryIsolationMode;
    }

    project.updatedAt = new Date().toISOString();
    return { ...project, pinnedFiles: [...project.pinnedFiles] };
  }

  /**
   * Delete a project workspace.
   */
  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      return false;
    }
    return this.projects.delete(projectId);
  }

  /**
   * Attach a pinned context file to a project workspace.
   */
  async addPinnedFile(
    userId: string,
    projectId: string,
    file: { id?: string; name: string; size?: number; mimeType?: string; content?: string },
  ): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (!file.name || !file.name.trim()) {
      throw new Error('File name is required');
    }

    const fileId = file.id || `file-${randomUUID()}`;
    const calculatedSize =
      file.size !== undefined
        ? file.size
        : file.content
          ? Buffer.byteLength(file.content, 'utf8')
          : 0;

    const pinnedFile: PinnedFile = {
      id: fileId,
      name: file.name.trim(),
      size: calculatedSize,
      mimeType: file.mimeType || 'text/plain',
      content: file.content,
    };

    // Replace if exists, otherwise push
    const existingIndex = project.pinnedFiles.findIndex((f) => f.id === fileId);
    if (existingIndex >= 0) {
      project.pinnedFiles[existingIndex] = pinnedFile;
    } else {
      project.pinnedFiles.push(pinnedFile);
    }

    project.updatedAt = new Date().toISOString();
    return { ...project, pinnedFiles: [...project.pinnedFiles] };
  }

  /**
   * Remove a pinned context file from a project workspace.
   */
  async removePinnedFile(userId: string, projectId: string, fileId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      throw new Error(`Project ${projectId} not found`);
    }

    const initialLength = project.pinnedFiles.length;
    project.pinnedFiles = project.pinnedFiles.filter((f) => f.id !== fileId);

    if (project.pinnedFiles.length === initialLength) {
      throw new Error(`Pinned file ${fileId} not found in project ${projectId}`);
    }

    project.updatedAt = new Date().toISOString();
    return { ...project, pinnedFiles: [...project.pinnedFiles] };
  }

  /**
   * Construct structured prompt context injection for the project workspace.
   */
  async getProjectContextPrompt(
    userId: string,
    projectId: string,
  ): Promise<ProjectContextPrompt | null> {
    const project = await this.getProject(userId, projectId);
    if (!project) {
      return null;
    }

    const customInstructions = project.customInstructions ?? '';

    let pinnedFilesContext = '';
    if (project.pinnedFiles.length > 0) {
      pinnedFilesContext = project.pinnedFiles
        .map((f) => {
          const header = `### File: ${f.name} (${f.mimeType}, ${f.size} bytes)`;
          const content = f.content !== undefined ? f.content : '[Binary or empty content]';
          return `${header}\n\`\`\`\n${content}\n\`\`\``;
        })
        .join('\n\n');
    }

    return {
      customInstructions,
      pinnedFilesContext,
      isolationMode: project.memoryIsolationMode,
    };
  }
}

export const projectService = new ProjectService();
