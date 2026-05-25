import { createAppError } from '@quant/server-core';

export interface Project {
  id: string;
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateProjectInput {
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
}

export interface UpdateProjectInput {
  name?: string;
  type?: 'video' | 'image' | 'audio';
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class ProjectService {
  private projects: Project[] = [];
  private idCounter = 0;

  async createProject(input: CreateProjectInput): Promise<Project> {
    this.idCounter++;
    const project: Project = {
      id: `project-${this.idCounter}`,
      userId: input.userId,
      name: input.name,
      type: input.type,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    this.projects.push(project);
    return project;
  }

  async getProject(projectId: string): Promise<Project> {
    const project = this.projects.find((p) => p.id === projectId && !p.deletedAt);

    if (!project) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    return project;
  }

  async listProjects(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Project>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const userProjects = this.projects
      .filter((p) => p.userId === userId && !p.deletedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = userProjects.length;
    const skip = (page - 1) * pageSize;
    const data = userProjects.slice(skip, skip + pageSize);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async updateProject(
    projectId: string,
    userId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const project = this.projects.find((p) => p.id === projectId && !p.deletedAt);

    if (!project) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    if (project.userId !== userId) {
      throw createAppError('Only the owner can update this project', 403, 'NOT_PROJECT_OWNER');
    }

    if (input.name) project.name = input.name;
    if (input.type) project.type = input.type;
    project.updatedAt = new Date();

    return project;
  }

  async deleteProject(projectId: string, userId: string): Promise<Project> {
    const project = this.projects.find((p) => p.id === projectId && !p.deletedAt);

    if (!project) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    if (project.userId !== userId) {
      throw createAppError('Only the owner can delete this project', 403, 'NOT_PROJECT_OWNER');
    }

    project.deletedAt = new Date();
    return project;
  }

  async duplicateProject(projectId: string, userId: string): Promise<Project> {
    const original = this.projects.find((p) => p.id === projectId && !p.deletedAt);

    if (!original) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    this.idCounter++;
    const duplicate: Project = {
      id: `project-${this.idCounter}`,
      userId,
      name: `${original.name} (Copy)`,
      type: original.type,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    this.projects.push(duplicate);
    return duplicate;
  }
}
