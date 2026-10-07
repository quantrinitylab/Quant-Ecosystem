import { EventEmitter } from 'events';
import { MemoryStore } from '../memory/memory-store.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Planner } from '../planning/planner.js';
import { Executor } from '../execution/executor.js';

export interface AgentConfig {
  id: string;
  name: string;
  personality?: string;
  capabilities: string[];
  model?: string;
}

export class Agent extends EventEmitter {
  public id: string;
  public name: string;
  public config: AgentConfig;
  private memory: MemoryStore;
  private tools: ToolRegistry;
  private planner: Planner;
  private executor: Executor;
  private isRunning: boolean = false;

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.config = config;

    this.memory = new MemoryStore(config.id);
    this.tools = new ToolRegistry();
    this.planner = new Planner(this.memory, this.tools);
    this.executor = new Executor(this.memory, this.tools);

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.executor.on('task:completed', (task) => {
      this.emit('task:completed', task);
    });

    this.executor.on('task:failed', (task, error) => {
      this.emit('task:failed', task, error);
    });
  }

  async think(input: string, context?: any): Promise<any> {
    // Core reasoning loop
    const memoryContext = await this.memory.retrieveRelevant(input);

    const plan = await this.planner.createPlan(input, {
      ...context,
      memory: memoryContext,
      capabilities: this.config.capabilities,
    });

    this.emit('thinking:plan_created', plan);

    return plan;
  }

  async execute(plan: any): Promise<any> {
    this.isRunning = true;
    const result = await this.executor.execute(plan);
    this.isRunning = false;

    // Store outcome in memory
    await this.memory.store({
      type: 'execution_result',
      content: { input: plan, output: result },
    });

    return result;
  }

  async run(input: string, context?: any): Promise<any> {
    const plan = await this.think(input, context);
    const result = await this.execute(plan);

    this.emit('agent:task_completed', {
      input,
      plan,
      result,
    });

    return result;
  }

  async addTool(tool: any) {
    this.tools.register(tool);
  }

  getMemory() {
    return this.memory;
  }

  isBusy(): boolean {
    return this.isRunning;
  }
}
