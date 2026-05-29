import { describe, it, expect } from 'vitest';
import { CodexVoiceInterface } from '../commands/voice-interface.js';
import type { CodexProject, BuildResult, DeployResult, ScaffoldResult } from '../types.js';

describe('Phase 71 Integration: Voice-to-Deploy E2E Pipeline', () => {
  it('voice to scaffold to build to deploy E2E', async () => {
    const voice = new CodexVoiceInterface();

    // Step 1: Parse scaffold command from natural language
    const scaffoldCmd = voice.parseCommand('build a game called SpaceRunner');
    expect(scaffoldCmd).not.toBeNull();
    expect(scaffoldCmd!.type).toBe('scaffold');
    expect(scaffoldCmd!.templateType).toBe('game');
    expect(scaffoldCmd!.projectName).toBe('SpaceRunner');

    // Step 2: Execute scaffold command
    const scaffoldResult = (await voice.execute(scaffoldCmd!)) as ScaffoldResult;
    expect(scaffoldResult).not.toBeNull();
    expect(scaffoldResult.success).toBe(true);
    expect(scaffoldResult.templateUsed).toBe('game-template');
    expect(scaffoldResult.filesCreated.length).toBeGreaterThan(0);

    // Step 3: Parse build command and execute
    const buildCmd = voice.parseCommand('build SpaceRunner');
    expect(buildCmd).not.toBeNull();
    expect(buildCmd!.type).toBe('build');
    expect(buildCmd!.projectName).toBe('SpaceRunner');

    const buildResult = (await voice.execute(buildCmd!)) as BuildResult;
    expect(buildResult).not.toBeNull();
    expect(buildResult.success).toBe(true);
    expect(buildResult.projectId).toBeDefined();
    expect(buildResult.artifacts.length).toBeGreaterThan(0);

    // Step 4: Parse deploy command and execute
    const deployCmd = voice.parseCommand('deploy SpaceRunner to production');
    expect(deployCmd).not.toBeNull();
    expect(deployCmd!.type).toBe('deploy');
    expect(deployCmd!.projectName).toBe('SpaceRunner');
    expect(deployCmd!.target).toBe('production');

    const deployResult = (await voice.execute(deployCmd!)) as DeployResult;
    expect(deployResult).not.toBeNull();
    expect(deployResult.success).toBe(true);
    expect(deployResult.url).toBeDefined();
    expect(deployResult.url!.toLowerCase()).toContain('spacerunner');
  });

  it('full project lifecycle via voice commands', async () => {
    const voice = new CodexVoiceInterface();

    // Scaffold a new project
    const scaffoldCmd = voice.parseCommand('create a tool called MyCLI');
    expect(scaffoldCmd).not.toBeNull();
    const scaffoldResult = (await voice.execute(scaffoldCmd!)) as ScaffoldResult;
    expect(scaffoldResult.success).toBe(true);
    expect(scaffoldResult.filesCreated.length).toBeGreaterThan(0);

    // Build the project
    const buildCmd = voice.parseCommand('build MyCLI');
    expect(buildCmd).not.toBeNull();
    const buildResult = (await voice.execute(buildCmd!)) as BuildResult;
    expect(buildResult.success).toBe(true);
    expect(buildResult.artifacts.length).toBeGreaterThan(0);

    // Deploy the project
    const deployCmd = voice.parseCommand('deploy MyCLI to production');
    expect(deployCmd).not.toBeNull();
    const deployResult = (await voice.execute(deployCmd!)) as DeployResult;
    expect(deployResult.success).toBe(true);
    expect(deployResult.url).toBeDefined();

    // Check status via voice
    const statusCmd = voice.parseCommand('status of MyCLI');
    expect(statusCmd).not.toBeNull();
    expect(statusCmd!.type).toBe('status');
    const statusResult = (await voice.execute(statusCmd!)) as CodexProject[];
    expect(statusResult.length).toBeGreaterThan(0);
    const project = statusResult.find((p) => p.name === 'MyCLI');
    expect(project).toBeDefined();

    // List projects
    const listCmd = voice.parseCommand('list all projects');
    expect(listCmd).not.toBeNull();
    expect(listCmd!.type).toBe('list');
    const listResult = (await voice.execute(listCmd!)) as CodexProject[];
    expect(listResult.length).toBeGreaterThan(0);
    expect(listResult.some((p) => p.name === 'MyCLI')).toBe(true);

    // Verify state transitions were recorded
    const listedProject = listResult.find((p) => p.name === 'MyCLI')!;
    expect(listedProject.logs.length).toBeGreaterThan(0);
    expect(listedProject.status).toBeDefined();
  });
});
