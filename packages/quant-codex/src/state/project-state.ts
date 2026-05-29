import type { CodexProject, ProjectLog, ProjectStatus, ProjectTemplate } from '../types.js';

export class ProjectStateManager {
  private projects: Map<string, CodexProject> = new Map();

  createProject(name: string, template: ProjectTemplate): CodexProject {
    const id = `proj_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const now = Date.now();

    const project: CodexProject = {
      id,
      name,
      templateId: template.id,
      type: template.type,
      status: 'scaffolding',
      createdAt: now,
      updatedAt: now,
      files: [...template.files],
      agents: [],
      logs: [
        {
          timestamp: now,
          level: 'info',
          message: `Project "${name}" created from template "${template.name}"`,
          source: 'project-state',
        },
      ],
      artifacts: [],
    };

    this.projects.set(id, project);
    return project;
  }

  getProject(id: string): CodexProject | undefined {
    return this.projects.get(id);
  }

  listProjects(): CodexProject[] {
    return Array.from(this.projects.values());
  }

  updateStatus(id: string, status: ProjectStatus): boolean {
    const project = this.projects.get(id);
    if (!project) return false;

    project.status = status;
    project.updatedAt = Date.now();
    project.logs.push({
      timestamp: Date.now(),
      level: 'info',
      message: `Status changed to "${status}"`,
      source: 'project-state',
    });
    return true;
  }

  addLog(id: string, log: Omit<ProjectLog, 'timestamp'>): void {
    const project = this.projects.get(id);
    if (!project) return;

    project.logs.push({
      ...log,
      timestamp: Date.now(),
    });
    project.updatedAt = Date.now();
  }

  addArtifact(id: string, artifact: string): void {
    const project = this.projects.get(id);
    if (!project) return;

    project.artifacts.push(artifact);
    project.updatedAt = Date.now();
  }

  deleteProject(id: string): boolean {
    return this.projects.delete(id);
  }
}
