import type { AgentTask, BuildResult, CodexProject, ProjectStatus } from '../types.js';

interface BuildStatus {
  completed: number;
  total: number;
  status: ProjectStatus;
}

export class BuildOrchestrator {
  private statusMap: Map<string, BuildStatus> = new Map();
  private agentPool: string[] = [
    'agent-builder-01',
    'agent-builder-02',
    'agent-tester-01',
    'agent-bundler-01',
    'agent-optimizer-01',
  ];

  decompose(project: CodexProject): AgentTask[] {
    const tasks: AgentTask[] = [];
    const now = Date.now();

    // Create setup task
    tasks.push({
      id: `task_${project.id}_setup`,
      projectId: project.id,
      description: `Initialize build environment for ${project.name}`,
      status: 'pending',
      assignedAgent: null,
      result: null,
      createdAt: now,
      completedAt: null,
    });

    // Create file compilation tasks (one per file)
    for (const file of project.files) {
      tasks.push({
        id: `task_${project.id}_compile_${file.path.replace(/[^a-z0-9]/gi, '_')}`,
        projectId: project.id,
        description: `Compile ${file.path}`,
        status: 'pending',
        assignedAgent: null,
        result: null,
        createdAt: now,
        completedAt: null,
      });
    }

    // Create test task
    tasks.push({
      id: `task_${project.id}_test`,
      projectId: project.id,
      description: `Run tests for ${project.name}`,
      status: 'pending',
      assignedAgent: null,
      result: null,
      createdAt: now,
      completedAt: null,
    });

    // Create bundle task
    tasks.push({
      id: `task_${project.id}_bundle`,
      projectId: project.id,
      description: `Bundle output for ${project.name}`,
      status: 'pending',
      assignedAgent: null,
      result: null,
      createdAt: now,
      completedAt: null,
    });

    return tasks;
  }

  assignAgents(tasks: AgentTask[]): AgentTask[] {
    return tasks.map((task, index) => ({
      ...task,
      status: 'assigned' as const,
      assignedAgent: this.agentPool[index % this.agentPool.length] ?? this.agentPool[0]!,
    }));
  }

  async build(project: CodexProject): Promise<BuildResult> {
    const startTime = Date.now();
    const tasks = this.decompose(project);
    const assignedTasks = this.assignAgents(tasks);

    this.statusMap.set(project.id, {
      completed: 0,
      total: assignedTasks.length,
      status: 'building',
    });

    const errors: string[] = [];
    const artifacts: string[] = [];

    // Simulate building each task
    for (const task of assignedTasks) {
      // Simulate task execution
      await Promise.resolve();
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = 'success';

      const currentStatus = this.statusMap.get(project.id);
      if (currentStatus) {
        currentStatus.completed++;
      }
    }

    // Add build artifacts
    artifacts.push(`${project.name}/dist/index.js`);
    artifacts.push(`${project.name}/dist/index.d.ts`);

    const duration = Date.now() - startTime;
    const success = errors.length === 0;

    this.statusMap.set(project.id, {
      completed: assignedTasks.length,
      total: assignedTasks.length,
      status: success ? 'deployed' : 'failed',
    });

    return {
      success,
      projectId: project.id,
      duration,
      artifacts,
      errors,
    };
  }

  getStatus(projectId: string): BuildStatus {
    return this.statusMap.get(projectId) ?? { completed: 0, total: 0, status: 'idle' };
  }
}
