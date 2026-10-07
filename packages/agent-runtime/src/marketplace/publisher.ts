import { AgentSpec, AgentSpecSchema, PublishedAgentSpec } from './agent-spec.js';

export interface PublishResult {
  success: boolean;
  agentId?: string;
  errors?: string[];
}

export class AgentPublisher {
  private readonly published: Map<string, PublishedAgentSpec> = new Map();

  validate(spec: unknown): { valid: boolean; errors: string[] } {
    const result = AgentSpecSchema.safeParse(spec);
    if (result.success) {
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  publish(spec: AgentSpec): PublishResult {
    const validation = this.validate(spec);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const agentId = `${spec.author}/${spec.name}@${spec.version}`;

    if (this.published.has(agentId)) {
      return {
        success: false,
        errors: [`Agent already published: ${agentId}`],
      };
    }

    const published: PublishedAgentSpec = {
      ...spec,
      id: agentId,
      publishedAt: Date.now(),
      downloads: 0,
      rating: 0,
    };

    this.published.set(agentId, published);
    return { success: true, agentId };
  }

  unpublish(agentId: string): boolean {
    return this.published.delete(agentId);
  }

  getPublished(): PublishedAgentSpec[] {
    return [...this.published.values()];
  }

  getById(agentId: string): PublishedAgentSpec | undefined {
    return this.published.get(agentId);
  }
}
