import type { ProjectTemplate, ScaffoldResult } from '../types.js';
import { builtinTemplates } from './templates.js';

export class ProjectScaffolder {
  private templates: Map<string, ProjectTemplate> = new Map();

  constructor() {
    for (const template of builtinTemplates) {
      this.templates.set(template.id, template);
    }
  }

  registerTemplate(template: ProjectTemplate): void {
    this.templates.set(template.id, template);
  }

  listTemplates(): ProjectTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): ProjectTemplate | undefined {
    return this.templates.get(id);
  }

  scaffold(templateId: string, projectName: string): ScaffoldResult {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        success: false,
        projectId: '',
        filesCreated: [],
        templateUsed: templateId,
      };
    }

    const projectId = `proj_${projectName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const filesCreated: string[] = [];

    for (const file of template.files) {
      const filePath = `${projectName}/${file.path}`;
      filesCreated.push(filePath);
    }

    // Generate package.json for the project
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      private: true,
      scripts: template.scripts,
      dependencies: template.dependencies,
    };
    filesCreated.push(`${projectName}/package.json`);

    void packageJson;

    return {
      success: true,
      projectId,
      filesCreated,
      templateUsed: template.id,
    };
  }
}
