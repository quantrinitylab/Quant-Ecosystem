import { describe, it, expect } from 'vitest';
import { CodexVoiceBridge } from '../integrations/codex-voice-bridge.js';

describe('CodexVoiceBridge', () => {
  it('parses build command', async () => {
    const bridge = new CodexVoiceBridge();
    const result = await bridge.handleBuildCommand('build a game called SpaceRunner');
    expect(result.success).toBe(true);
    expect(result.action).toBe('build');
    expect(result.project?.name).toBe('SpaceRunner');
    expect(result.spokenResponse).toContain('SpaceRunner');
  });

  it('parses scaffold command', async () => {
    const bridge = new CodexVoiceBridge();
    const result = await bridge.handleScaffoldCommand('scaffold a new tool called formatter');
    expect(result.success).toBe(true);
    expect(result.action).toBe('scaffold');
    expect(result.project?.name).toBe('formatter');
    expect(result.project?.status).toBe('scaffolding');
  });

  it('gets project status', async () => {
    const bridge = new CodexVoiceBridge();
    await bridge.handleBuildCommand('build a game called MyGame');
    const status = bridge.getProjectStatus('MyGame');
    expect(status.success).toBe(true);
    expect(status.project?.name).toBe('MyGame');
    expect(status.project?.status).toBe('building');
  });

  it('handles unknown command gracefully', async () => {
    const bridge = new CodexVoiceBridge();
    const result = await bridge.handleBuildCommand('something unrecognized');
    expect(result.success).toBe(false);
    expect(result.action).toBe('unknown');
  });

  it('handles deploy command', async () => {
    const bridge = new CodexVoiceBridge();
    await bridge.handleBuildCommand('build a game called MyApp');
    const result = await bridge.handleDeployCommand('deploy my project MyApp');
    expect(result.success).toBe(true);
    expect(result.action).toBe('deploy');
    expect(result.project?.status).toBe('deploying');
  });

  it('returns status for no active projects', () => {
    const bridge = new CodexVoiceBridge();
    const status = bridge.getProjectStatus();
    expect(status.success).toBe(true);
    expect(status.spokenResponse).toContain('no active projects');
  });
});
