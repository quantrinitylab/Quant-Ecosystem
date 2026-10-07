import type { ParsedIntent, PermissionTier, ToolDefinition, ToolPlan, ToolPlanStep } from '../types.js';

export class MultiStepPlanner {
  plan(intent: string, availableTools: ToolDefinition[]): ToolPlan {
    const lower = intent.toLowerCase();
    const steps: ToolPlanStep[] = [];
    const selectedTools: ToolDefinition[] = [];

    // Score tools by relevance to intent
    const scored = availableTools.map((tool) => {
      let score = 0;
      const nameWords = tool.name.toLowerCase().split(/\s+/);
      const intentWords = lower.split(/\s+/);

      for (const nw of nameWords) {
        if (intentWords.includes(nw)) {
          score += 2;
        }
      }
      for (const tag of tool.tags) {
        if (intentWords.includes(tag.toLowerCase())) {
          score += 1;
        }
      }
      return { tool, score };
    });

    // Select top tools with score > 0
    const relevant = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    for (const { tool } of relevant) {
      selectedTools.push(tool);
    }

    // If no tools matched, return empty plan
    if (selectedTools.length === 0) {
      return {
        id: this.generateId(),
        steps: [],
        estimatedCost: 'free',
        requiredPermission: 0 as PermissionTier,
        description: `No tools matched intent: ${intent}`,
      };
    }

    // Create steps with dependency chain
    for (let i = 0; i < selectedTools.length; i++) {
      const tool = selectedTools[i]!;
      const step: ToolPlanStep = {
        stepId: `step-${i + 1}`,
        toolId: tool.id,
        params: this.buildDefaultParams(tool),
        dependsOn: i > 0 ? [`step-${i}`] : [],
        outputKey: `output_${i + 1}`,
      };
      steps.push(step);
    }

    const maxTier = Math.max(...selectedTools.map((t) => t.permissionTier)) as PermissionTier;
    const cost = this.estimateCostFromTools(selectedTools);

    return {
      id: this.generateId(),
      steps,
      estimatedCost: cost,
      requiredPermission: maxTier,
      description: `Plan for: ${intent} (${steps.length} steps)`,
    };
  }

  planFromParsedIntents(intents: ParsedIntent[], availableTools: ToolDefinition[]): ToolPlan {
    const steps: ToolPlanStep[] = [];
    const selectedTools: ToolDefinition[] = [];

    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i]!;
      const tool = this.findBestToolForIntent(intent, availableTools);
      if (!tool) continue;

      selectedTools.push(tool);
      const params = this.buildParamsFromIntent(intent, tool);

      // Auto-wire dependencies: if previous step might produce an ID needed by this step
      const dependsOn: string[] = [];
      if (i > 0) {
        const prevStep = steps[steps.length - 1];
        if (prevStep) {
          // Wire if the previous step's tool produces IDs that this step might need
          const prevTool = selectedTools[selectedTools.length - 2];
          if (prevTool && this.shouldWireDependency(prevTool, tool)) {
            dependsOn.push(prevStep.stepId);
          }
        }
      }

      const step: ToolPlanStep = {
        stepId: `step-${steps.length + 1}`,
        toolId: tool.id,
        params,
        dependsOn,
        outputKey: `output_${steps.length + 1}`,
      };
      steps.push(step);
    }

    if (steps.length === 0) {
      return {
        id: this.generateId(),
        steps: [],
        estimatedCost: 'free',
        requiredPermission: 0 as PermissionTier,
        description: 'No tools matched the parsed intents',
      };
    }

    const maxTier = Math.max(...selectedTools.map((t) => t.permissionTier)) as PermissionTier;
    const cost = this.estimateCostFromTools(selectedTools);
    const description = intents.map((i) => i.action).join(' + ');

    const plan: ToolPlan = {
      id: this.generateId(),
      steps,
      estimatedCost: cost,
      requiredPermission: maxTier,
      description: `Plan for: ${description} (${steps.length} steps)`,
    };

    const validation = this.validatePlan(plan);
    if (!validation.valid) {
      return {
        id: plan.id,
        steps: [],
        estimatedCost: 'free',
        requiredPermission: 0 as PermissionTier,
        description: `Invalid plan: ${validation.errors.join(', ')}`,
      };
    }

    return plan;
  }

  private findBestToolForIntent(
    intent: ParsedIntent,
    availableTools: ToolDefinition[],
  ): ToolDefinition | null {
    let bestTool: ToolDefinition | null = null;
    let bestScore = 0;

    for (const tool of availableTools) {
      let score = 0;
      const lowerName = tool.name.toLowerCase();
      const lowerDesc = tool.description.toLowerCase();

      // Action verb match
      if (lowerName.includes(intent.action) || lowerDesc.includes(intent.action)) {
        score += 3;
      }

      // Tag match
      for (const tag of tool.tags) {
        if (tag.toLowerCase() === intent.action) {
          score += 2;
        }
        if (intent.entities['type'] && tag.toLowerCase().includes(intent.entities['type'])) {
          score += 1;
        }
      }

      // App match
      if (intent.targetApp && tool.appId === intent.targetApp) {
        score += 4;
      }

      // Entity type match
      const entityType = intent.entities['type'];
      if (entityType) {
        if (lowerName.includes(entityType) || lowerDesc.includes(entityType)) {
          score += 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTool = tool;
      }
    }

    return bestTool;
  }

  private buildParamsFromIntent(
    intent: ParsedIntent,
    _tool: ToolDefinition,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Map entities to common param names
    if (intent.entities['email']) {
      params['to'] = intent.entities['email'];
    }
    if (intent.entities['recipient']) {
      params['to'] = intent.entities['recipient'];
    }
    if (intent.entities['group']) {
      params['to'] = intent.entities['group'];
    }
    if (intent.entities['content']) {
      params['body'] = intent.entities['content'];
      params['message'] = intent.entities['content'];
    }
    if (intent.entities['mention']) {
      params['mention'] = intent.entities['mention'];
    }

    // Map temporal data
    if (intent.temporal?.startTime) {
      params['startTime'] = intent.temporal.startTime;
    }
    if (intent.temporal?.endTime) {
      params['endTime'] = intent.temporal.endTime;
    }
    if (intent.temporal?.duration) {
      params['duration'] = intent.temporal.duration;
    }

    return params;
  }

  private shouldWireDependency(prevTool: ToolDefinition, currentTool: ToolDefinition): boolean {
    // Wire dependency if prev tool's output might produce an ID the next tool needs
    const prevOutput = prevTool.outputSchema;
    if (!prevOutput.fields) return false;

    const outputFieldNames = Object.keys(prevOutput.fields);
    const idFields = outputFieldNames.filter(
      (f) => f.endsWith('Id') || f.endsWith('_id') || f === 'id',
    );

    if (idFields.length === 0) return false;

    // Check if current tool accepts any ID-like params
    const inputFields = Object.keys(currentTool.inputSchema);
    const needsId = inputFields.some(
      (f) => f.endsWith('Id') || f.endsWith('_id') || f === 'referenceId',
    );

    return needsId;
  }

  validatePlan(plan: ToolPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (plan.steps.length === 0) {
      errors.push('Plan has no steps');
      return { valid: false, errors };
    }

    const stepIds = new Set(plan.steps.map((s) => s.stepId));

    for (const step of plan.steps) {
      if (!step.toolId) {
        errors.push(`Step ${step.stepId} has no toolId`);
      }
      if (!step.stepId) {
        errors.push('Step missing stepId');
      }
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push(`Step ${step.stepId} depends on non-existent step ${dep}`);
        }
      }
    }

    // Check for circular dependencies
    if (this.hasCycle(plan.steps)) {
      errors.push('Plan has circular dependencies');
    }

    return { valid: errors.length === 0, errors };
  }

  estimateCost(plan: ToolPlan): string {
    return plan.estimatedCost;
  }

  private buildDefaultParams(tool: ToolDefinition): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(tool.inputSchema)) {
      if (schema.default !== undefined) {
        params[key] = schema.default;
      }
    }
    return params;
  }

  private estimateCostFromTools(tools: ToolDefinition[]): string {
    const costLevels = { free: 0, low: 1, medium: 2, high: 3 };
    const maxCost = Math.max(...tools.map((t) => costLevels[t.costEstimate]));
    const labels: Array<'free' | 'low' | 'medium' | 'high'> = ['free', 'low', 'medium', 'high'];
    return labels[maxCost] ?? 'free';
  }

  private hasCycle(steps: ToolPlanStep[]): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.stepId, s]));

    const dfs = (stepId: string): boolean => {
      visited.add(stepId);
      inStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const dep of step.dependsOn) {
          if (!visited.has(dep)) {
            if (dfs(dep)) return true;
          } else if (inStack.has(dep)) {
            return true;
          }
        }
      }

      inStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.stepId)) {
        if (dfs(step.stepId)) return true;
      }
    }
    return false;
  }

  private generateId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
