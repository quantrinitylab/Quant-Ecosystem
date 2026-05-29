import type {
  BuildResult,
  CodexCommand,
  CodexProject,
  DeployResult,
  ProjectType,
  ScaffoldResult,
} from '../types.js';
import { ProjectScaffolder } from '../scaffolder/project-scaffolder.js';
import { BuildOrchestrator } from '../orchestrator/build-orchestrator.js';
import { DeployPipeline } from '../orchestrator/deploy-pipeline.js';
import { ProjectStateManager } from '../state/project-state.js';

const TEMPLATE_MAP: Record<string, ProjectType> = {
  game: 'game',
  app: 'app',
  tool: 'tool',
  agent: 'agent',
  lens: 'lens',
  application: 'app',
  cli: 'tool',
  bot: 'agent',
  ar: 'lens',
  filter: 'lens',
};

const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  type: CodexCommand['type'];
  extract: (match: RegExpMatchArray) => Partial<CodexCommand>;
}> = [
  {
    pattern:
      /(?:build|create|scaffold|make|start)\s+(?:a\s+(?:new\s+)?)?(\w+)\s+(?:called|named)\s+(\w+)/i,
    type: 'scaffold',
    extract: (m) => ({
      templateType: resolveType(m[1] ?? ''),
      projectName: m[2],
    }),
  },
  {
    pattern: /(?:build|create|scaffold|make|start)\s+(?:a\s+(?:new\s+)?)?(\w+)\s+(\w+)/i,
    type: 'scaffold',
    extract: (m) => ({
      templateType: resolveType(m[1] ?? ''),
      projectName: m[2],
    }),
  },
  {
    pattern: /(?:scaffold|create)\s+(?:a\s+(?:new\s+)?)?(\w+)/i,
    type: 'scaffold',
    extract: (m) => ({
      templateType: resolveType(m[1] ?? ''),
    }),
  },
  {
    pattern: /deploy\s+(?:my\s+)?(\w+)(?:\s+to\s+(\w+))?/i,
    type: 'deploy',
    extract: (m) => ({
      projectName: m[1],
      target: m[2] ?? 'production',
    }),
  },
  {
    pattern: /build\s+(?:my\s+)?(\w+)/i,
    type: 'build',
    extract: (m) => ({
      projectName: m[1],
    }),
  },
  {
    pattern: /(?:status|progress)\s*(?:of\s+)?(\w+)?/i,
    type: 'status',
    extract: (m) => ({
      projectName: m[1],
    }),
  },
  {
    pattern: /(?:list|show)\s+(?:all\s+)?(?:my\s+)?projects/i,
    type: 'list',
    extract: () => ({}),
  },
  {
    pattern: /(?:delete|remove)\s+(?:my\s+)?(\w+)/i,
    type: 'delete',
    extract: (m) => ({
      projectName: m[1],
    }),
  },
];

function resolveType(input: string): ProjectType {
  const lower = input.toLowerCase();
  return TEMPLATE_MAP[lower] ?? 'app';
}

export class CodexVoiceInterface {
  private scaffolder: ProjectScaffolder;
  private buildOrchestrator: BuildOrchestrator;
  private deployPipeline: DeployPipeline;
  private stateManager: ProjectStateManager;

  constructor() {
    this.scaffolder = new ProjectScaffolder();
    this.buildOrchestrator = new BuildOrchestrator();
    this.deployPipeline = new DeployPipeline();
    this.stateManager = new ProjectStateManager();
  }

  parseCommand(input: string): CodexCommand | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    for (const { pattern, type, extract } of COMMAND_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        return { type, ...extract(match) };
      }
    }

    return null;
  }

  async execute(
    command: CodexCommand,
  ): Promise<ScaffoldResult | BuildResult | DeployResult | CodexProject[] | null> {
    switch (command.type) {
      case 'scaffold': {
        const templateId = `${command.templateType ?? 'app'}-template`;
        const name = command.projectName ?? `project-${Date.now()}`;
        const template = this.scaffolder.getTemplate(templateId);
        if (!template) return null;

        this.stateManager.createProject(name, template);
        return this.scaffolder.scaffold(templateId, name);
      }
      case 'build': {
        const projects = this.stateManager.listProjects();
        const project = projects.find((p) => p.name === command.projectName);
        if (!project) return null;
        this.stateManager.updateStatus(project.id, 'building');
        return this.buildOrchestrator.build(project);
      }
      case 'deploy': {
        const projects = this.stateManager.listProjects();
        const project = projects.find((p) => p.name === command.projectName);
        if (!project) return null;
        this.stateManager.updateStatus(project.id, 'deploying');
        return this.deployPipeline.run(project, command.target ?? 'production');
      }
      case 'list':
        return this.stateManager.listProjects();
      case 'status': {
        const projects = this.stateManager.listProjects();
        if (command.projectName) {
          const match = projects.filter((p) => p.name === command.projectName);
          return match.length > 0 ? match : projects;
        }
        return projects;
      }
      case 'delete': {
        const projects = this.stateManager.listProjects();
        const project = projects.find((p) => p.name === command.projectName);
        if (project) {
          this.stateManager.deleteProject(project.id);
        }
        return this.stateManager.listProjects();
      }
    }
  }

  getSuggestions(partial: string): string[] {
    const lower = partial.toLowerCase();
    const suggestions: string[] = [];

    if ('scaffold'.startsWith(lower) || 'create'.startsWith(lower)) {
      suggestions.push('scaffold a new game called MyGame');
      suggestions.push('create an app called MyApp');
      suggestions.push('scaffold a tool called MyCLI');
    }
    if ('build'.startsWith(lower)) {
      suggestions.push('build my project');
    }
    if ('deploy'.startsWith(lower)) {
      suggestions.push('deploy my app to production');
    }
    if ('status'.startsWith(lower)) {
      suggestions.push('status of MyProject');
    }
    if ('list'.startsWith(lower) || 'show'.startsWith(lower)) {
      suggestions.push('list all projects');
    }
    if ('delete'.startsWith(lower) || 'remove'.startsWith(lower)) {
      suggestions.push('delete my project');
    }

    return suggestions;
  }
}
