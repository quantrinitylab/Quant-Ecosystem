import { z } from 'zod';
import { PermissionLevel } from './permissions.js';

export const SubTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  estimatedDuration: z.number().positive(),
  requiredPermission: z.nativeEnum(PermissionLevel),
});

export type SubTask = z.infer<typeof SubTaskSchema>;

export interface AIInferenceAdapter {
  infer(prompt: string): Promise<string>;
}

export class TaskDecomposer {
  private readonly ai: AIInferenceAdapter;

  constructor(ai: AIInferenceAdapter) {
    this.ai = ai;
  }

  async decompose(task: string): Promise<SubTask[]> {
    const prompt = `Break down the following task into sub-tasks. Return a JSON array where each item has: id (string), description (string), dependencies (array of task ids), estimatedDuration (number in minutes), requiredPermission (one of: OBSERVE, SUGGEST, ACT_LOW, ACT_HIGH, FULL_AUTO).

Task: ${task}

Return only valid JSON array:`;

    const response = await this.ai.infer(prompt);
    const parsed = JSON.parse(response) as unknown[];
    return z.array(SubTaskSchema).parse(parsed);
  }

  prioritize(subtasks: SubTask[]): SubTask[] {
    // Topological sort based on dependencies
    const sorted: SubTask[] = [];
    const visited = new Set<string>();
    const taskMap = new Map(subtasks.map((t) => [t.id, t]));

    const visit = (task: SubTask): void => {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (dep) visit(dep);
      }
      sorted.push(task);
    };

    for (const task of subtasks) {
      visit(task);
    }

    return sorted;
  }
}
