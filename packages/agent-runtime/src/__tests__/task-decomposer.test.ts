import { describe, it, expect, vi } from 'vitest';
import { TaskDecomposer, AIInferenceAdapter } from '../task-decomposer.js';
import { PermissionLevel } from '../permissions.js';

describe('TaskDecomposer', () => {
  function createMockAI(response: string): AIInferenceAdapter {
    return {
      infer: vi.fn().mockResolvedValue(response),
    };
  }

  const validSubtasks = JSON.stringify([
    {
      id: 'task-1',
      description: 'Read user preferences',
      dependencies: [],
      estimatedDuration: 5,
      requiredPermission: 'OBSERVE',
    },
    {
      id: 'task-2',
      description: 'Generate suggestions',
      dependencies: ['task-1'],
      estimatedDuration: 10,
      requiredPermission: 'SUGGEST',
    },
    {
      id: 'task-3',
      description: 'Apply changes',
      dependencies: ['task-2'],
      estimatedDuration: 15,
      requiredPermission: 'ACT_LOW',
    },
  ]);

  it('decomposes a task using AI', async () => {
    const mockAI = createMockAI(validSubtasks);
    const decomposer = new TaskDecomposer(mockAI);

    const subtasks = await decomposer.decompose('Organize my email');
    expect(subtasks).toHaveLength(3);
    expect(subtasks[0]!.id).toBe('task-1');
    expect(subtasks[0]!.requiredPermission).toBe(PermissionLevel.OBSERVE);
    expect(mockAI.infer).toHaveBeenCalledOnce();
  });

  it('validates subtask schema', async () => {
    const invalidResponse = JSON.stringify([{ id: 'task-1' }]); // Missing fields
    const mockAI = createMockAI(invalidResponse);
    const decomposer = new TaskDecomposer(mockAI);

    await expect(decomposer.decompose('Do something')).rejects.toThrow();
  });

  it('prioritizes subtasks by dependencies (topological sort)', () => {
    const mockAI = createMockAI('[]');
    const decomposer = new TaskDecomposer(mockAI);

    const subtasks = [
      {
        id: 'task-3',
        description: 'Third',
        dependencies: ['task-2'],
        estimatedDuration: 5,
        requiredPermission: PermissionLevel.ACT_LOW,
      },
      {
        id: 'task-1',
        description: 'First',
        dependencies: [],
        estimatedDuration: 5,
        requiredPermission: PermissionLevel.OBSERVE,
      },
      {
        id: 'task-2',
        description: 'Second',
        dependencies: ['task-1'],
        estimatedDuration: 5,
        requiredPermission: PermissionLevel.SUGGEST,
      },
    ];

    const prioritized = decomposer.prioritize(subtasks);
    expect(prioritized[0]!.id).toBe('task-1');
    expect(prioritized[1]!.id).toBe('task-2');
    expect(prioritized[2]!.id).toBe('task-3');
  });

  it('handles tasks with no dependencies', () => {
    const mockAI = createMockAI('[]');
    const decomposer = new TaskDecomposer(mockAI);

    const subtasks = [
      {
        id: 'task-a',
        description: 'A',
        dependencies: [],
        estimatedDuration: 5,
        requiredPermission: PermissionLevel.OBSERVE,
      },
      {
        id: 'task-b',
        description: 'B',
        dependencies: [],
        estimatedDuration: 5,
        requiredPermission: PermissionLevel.OBSERVE,
      },
    ];

    const prioritized = decomposer.prioritize(subtasks);
    expect(prioritized).toHaveLength(2);
  });
});
