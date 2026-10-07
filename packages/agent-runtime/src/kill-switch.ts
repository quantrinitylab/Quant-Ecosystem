type HaltCallback = () => Promise<void>;

const HALT_TIMEOUT_MS = 500;

export class KillSwitch {
  private static instance: KillSwitch | null = null;
  private agents: Map<string, HaltCallback> = new Map();
  private active: boolean = false;

  private constructor() {}

  static getInstance(): KillSwitch {
    if (!KillSwitch.instance) {
      KillSwitch.instance = new KillSwitch();
    }
    return KillSwitch.instance;
  }

  static resetInstance(): void {
    KillSwitch.instance = null;
  }

  register(agentId: string, haltFn: HaltCallback): void {
    this.agents.set(agentId, haltFn);
  }

  deregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  async activate(): Promise<void> {
    this.active = true;
    const callbacks = Array.from(this.agents.values());
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, HALT_TIMEOUT_MS));
    await Promise.race([Promise.allSettled(callbacks.map((fn) => fn())), deadline]);
    this.agents.clear();
  }

  async voiceActivate(): Promise<void> {
    return this.activate();
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.agents.clear();
  }

  getRegisteredAgentCount(): number {
    return this.agents.size;
  }
}
