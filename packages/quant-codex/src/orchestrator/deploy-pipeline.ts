import type { CodexProject, DeployResult, DeployStage } from '../types.js';

const STAGES: DeployStage[] = ['validate', 'build', 'test', 'package', 'publish'];

export class DeployPipeline {
  private activeDeployments: Map<string, { stage: DeployStage; startedAt: number }> = new Map();
  private completedDeployments: Map<string, DeployResult> = new Map();

  async run(project: CodexProject, target: string): Promise<DeployResult> {
    this.activeDeployments.set(project.id, { stage: 'validate', startedAt: Date.now() });

    for (const stage of STAGES) {
      this.activeDeployments.set(project.id, {
        stage,
        startedAt: this.activeDeployments.get(project.id)?.startedAt ?? Date.now(),
      });

      const stageResult = await this.executeStage(stage, project);
      if (!stageResult.success) {
        this.activeDeployments.delete(project.id);
        const result: DeployResult = {
          success: false,
          projectId: project.id,
          stage,
          url: null,
          error: stageResult.error,
        };
        this.completedDeployments.set(project.id, result);
        return result;
      }
    }

    this.activeDeployments.delete(project.id);
    const url = `https://${target}/${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const result: DeployResult = {
      success: true,
      projectId: project.id,
      stage: 'publish',
      url,
      error: null,
    };
    this.completedDeployments.set(project.id, result);
    return result;
  }

  getStage(projectId: string): DeployStage | null {
    const deployment = this.activeDeployments.get(projectId);
    return deployment?.stage ?? null;
  }

  rollback(projectId: string): boolean {
    const completed = this.completedDeployments.get(projectId);
    if (!completed || !completed.success) {
      return false;
    }
    this.completedDeployments.delete(projectId);
    return true;
  }

  dryRun(project: CodexProject, target: string): DeployResult {
    // Validate that project has required files
    const hasEntryPoint = project.files.some(
      (f) => f.path === 'index.ts' || f.path === 'index.tsx' || f.path === 'game.ts',
    );

    if (!hasEntryPoint) {
      return {
        success: false,
        projectId: project.id,
        stage: 'validate',
        url: null,
        error: 'Missing entry point file',
      };
    }

    const url = `https://${target}/${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return {
      success: true,
      projectId: project.id,
      stage: 'publish',
      url,
      error: null,
    };
  }

  private async executeStage(
    stage: DeployStage,
    project: CodexProject,
  ): Promise<{ success: boolean; error: string | null }> {
    // Simulate stage execution
    await Promise.resolve();

    switch (stage) {
      case 'validate':
        if (project.files.length === 0) {
          return { success: false, error: 'No files to deploy' };
        }
        return { success: true, error: null };
      case 'build':
        return { success: true, error: null };
      case 'test':
        return { success: true, error: null };
      case 'package':
        return { success: true, error: null };
      case 'publish':
        return { success: true, error: null };
    }
  }
}
