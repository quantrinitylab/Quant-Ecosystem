import { describe, it, expect } from 'vitest';
import { ProjectScaffolder } from '../scaffolder/project-scaffolder.js';
import { builtinTemplates } from '../scaffolder/templates.js';
import { BuildOrchestrator } from '../orchestrator/build-orchestrator.js';
import { DeployPipeline } from '../orchestrator/deploy-pipeline.js';
import { CodexVoiceInterface } from '../commands/voice-interface.js';
import { ProjectStateManager } from '../state/project-state.js';
import type { CodexProject, ProjectTemplate } from '../types.js';

describe('ProjectScaffolder', () => {
  it('should have 5 built-in templates', () => {
    const scaffolder = new ProjectScaffolder();
    const templates = scaffolder.listTemplates();
    expect(templates.length).toBe(5);
  });

  it('should retrieve a template by id', () => {
    const scaffolder = new ProjectScaffolder();
    const template = scaffolder.getTemplate('game-template');
    expect(template).toBeDefined();
    expect(template!.type).toBe('game');
    expect(template!.name).toBe('HTML5 Canvas Game');
  });

  it('should register a custom template', () => {
    const scaffolder = new ProjectScaffolder();
    const custom: ProjectTemplate = {
      id: 'custom-template',
      name: 'Custom',
      type: 'tool',
      description: 'A custom template',
      files: [{ path: 'index.ts', content: 'export {}' }],
      dependencies: {},
      scripts: { build: 'tsc' },
    };
    scaffolder.registerTemplate(custom);
    expect(scaffolder.getTemplate('custom-template')).toBeDefined();
    expect(scaffolder.listTemplates().length).toBe(6);
  });

  it('should scaffold a project from a template', () => {
    const scaffolder = new ProjectScaffolder();
    const result = scaffolder.scaffold('game-template', 'SpaceRunner');
    expect(result.success).toBe(true);
    expect(result.templateUsed).toBe('game-template');
    expect(result.filesCreated.length).toBeGreaterThan(0);
    expect(result.filesCreated.some((f) => f.includes('SpaceRunner/'))).toBe(true);
  });

  it('should fail to scaffold with an invalid template', () => {
    const scaffolder = new ProjectScaffolder();
    const result = scaffolder.scaffold('nonexistent-template', 'Test');
    expect(result.success).toBe(false);
    expect(result.filesCreated.length).toBe(0);
  });
});

describe('BuildOrchestrator', () => {
  function createTestProject(): CodexProject {
    return {
      id: 'proj_test_1',
      name: 'TestProject',
      templateId: 'game-template',
      type: 'game',
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [
        { path: 'index.ts', content: 'export {}' },
        { path: 'game.ts', content: 'const x = 1;' },
      ],
      agents: [],
      logs: [],
      artifacts: [],
    };
  }

  it('should decompose a project into agent tasks', () => {
    const orchestrator = new BuildOrchestrator();
    const project = createTestProject();
    const tasks = orchestrator.decompose(project);
    // setup + 2 file tasks + test + bundle = 5
    expect(tasks.length).toBe(5);
    expect(tasks[0]!.description).toContain('Initialize');
  });

  it('should assign agents to tasks', () => {
    const orchestrator = new BuildOrchestrator();
    const project = createTestProject();
    const tasks = orchestrator.decompose(project);
    const assigned = orchestrator.assignAgents(tasks);
    expect(assigned.every((t) => t.assignedAgent !== null)).toBe(true);
    expect(assigned.every((t) => t.status === 'assigned')).toBe(true);
  });

  it('should build a project and return a result', async () => {
    const orchestrator = new BuildOrchestrator();
    const project = createTestProject();
    const result = await orchestrator.build(project);
    expect(result.success).toBe(true);
    expect(result.projectId).toBe('proj_test_1');
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.length).toBeGreaterThan(0);
  });

  it('should report status for a project', async () => {
    const orchestrator = new BuildOrchestrator();
    const project = createTestProject();
    await orchestrator.build(project);
    const status = orchestrator.getStatus(project.id);
    expect(status.completed).toBe(status.total);
    expect(status.status).toBe('deployed');
  });
});

describe('DeployPipeline', () => {
  function createTestProject(): CodexProject {
    return {
      id: 'proj_deploy_1',
      name: 'DeployTest',
      templateId: 'app-template',
      type: 'app',
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [
        { path: 'index.ts', content: 'export {}' },
        { path: 'App.tsx', content: 'export function App() {}' },
      ],
      agents: [],
      logs: [],
      artifacts: [],
    };
  }

  it('should run deployment through all stages', async () => {
    const pipeline = new DeployPipeline();
    const project = createTestProject();
    const result = await pipeline.run(project, 'quant.app');
    expect(result.success).toBe(true);
    expect(result.stage).toBe('publish');
    expect(result.url).toContain('quant.app');
  });

  it('should fail deployment if project has no files', async () => {
    const pipeline = new DeployPipeline();
    const project: CodexProject = {
      id: 'proj_empty',
      name: 'EmptyProject',
      templateId: 'app-template',
      type: 'app',
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      agents: [],
      logs: [],
      artifacts: [],
    };
    const result = await pipeline.run(project, 'quant.app');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No files to deploy');
  });

  it('should support dry-run mode', () => {
    const pipeline = new DeployPipeline();
    const project = createTestProject();
    const result = pipeline.dryRun(project, 'quant.app');
    expect(result.success).toBe(true);
    expect(result.url).toContain('deploytest');
  });

  it('should rollback a completed deployment', async () => {
    const pipeline = new DeployPipeline();
    const project = createTestProject();
    await pipeline.run(project, 'quant.app');
    const rolled = pipeline.rollback(project.id);
    expect(rolled).toBe(true);
  });
});

describe('CodexVoiceInterface', () => {
  it('should parse a scaffold command', () => {
    const voice = new CodexVoiceInterface();
    const cmd = voice.parseCommand('build a game called SpaceRunner');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('scaffold');
    expect(cmd!.templateType).toBe('game');
    expect(cmd!.projectName).toBe('SpaceRunner');
  });

  it('should parse a deploy command', () => {
    const voice = new CodexVoiceInterface();
    const cmd = voice.parseCommand('deploy my app to production');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('deploy');
    expect(cmd!.projectName).toBe('app');
    expect(cmd!.target).toBe('production');
  });

  it('should parse a list command', () => {
    const voice = new CodexVoiceInterface();
    const cmd = voice.parseCommand('list all my projects');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('list');
  });

  it('should return null for unrecognized input', () => {
    const voice = new CodexVoiceInterface();
    const cmd = voice.parseCommand('');
    expect(cmd).toBeNull();
  });

  it('should provide suggestions for partial input', () => {
    const voice = new CodexVoiceInterface();
    const suggestions = voice.getSuggestions('scaf');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.includes('scaffold'))).toBe(true);
  });
});

describe('ProjectStateManager', () => {
  it('should create and retrieve projects', () => {
    const manager = new ProjectStateManager();
    const template = builtinTemplates[0]!;
    const project = manager.createProject('TestGame', template);
    expect(project.name).toBe('TestGame');
    expect(project.type).toBe('game');
    expect(manager.getProject(project.id)).toBeDefined();
  });

  it('should list all projects', () => {
    const manager = new ProjectStateManager();
    const template = builtinTemplates[0]!;
    manager.createProject('Game1', template);
    manager.createProject('Game2', template);
    expect(manager.listProjects().length).toBe(2);
  });

  it('should update project status', () => {
    const manager = new ProjectStateManager();
    const template = builtinTemplates[0]!;
    const project = manager.createProject('TestGame', template);
    const updated = manager.updateStatus(project.id, 'building');
    expect(updated).toBe(true);
    expect(manager.getProject(project.id)!.status).toBe('building');
  });

  it('should delete a project', () => {
    const manager = new ProjectStateManager();
    const template = builtinTemplates[0]!;
    const project = manager.createProject('TestGame', template);
    expect(manager.deleteProject(project.id)).toBe(true);
    expect(manager.getProject(project.id)).toBeUndefined();
  });
});
