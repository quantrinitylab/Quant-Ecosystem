// ============================================================================
// QuantAI - Personas Service
// Custom AI personas with system prompts, model configs, and activation
// ============================================================================

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  avatar: string;
  temperature: number;
  maxTokens: number;
  createdAt: number;
  isActive: boolean;
}

export class PersonasService {
  private personas: Map<string, Persona> = new Map();
  private activeId: string | null = null;
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `persona-${this.idCounter}`;
  }

  create(persona: Omit<Persona, 'id' | 'createdAt' | 'isActive'>): Persona {
    const newPersona: Persona = {
      ...persona,
      id: this.generateId(),
      createdAt: Date.now(),
      isActive: false,
    };
    this.personas.set(newPersona.id, newPersona);
    return newPersona;
  }

  update(id: string, changes: Partial<Persona>): Persona | null {
    const persona = this.personas.get(id);
    if (!persona) return null;
    const updated: Persona = { ...persona, ...changes, id: persona.id };
    this.personas.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    if (!this.personas.has(id)) return false;
    if (this.activeId === id) this.activeId = null;
    this.personas.delete(id);
    return true;
  }

  list(): Persona[] {
    return [...this.personas.values()];
  }

  activate(id: string): Persona | null {
    const persona = this.personas.get(id);
    if (!persona) return null;

    // Deactivate current
    if (this.activeId) {
      const current = this.personas.get(this.activeId);
      if (current) current.isActive = false;
    }

    persona.isActive = true;
    this.activeId = id;
    return persona;
  }

  getActive(): Persona | null {
    if (!this.activeId) return null;
    return this.personas.get(this.activeId) ?? null;
  }

  duplicate(id: string): Persona | null {
    const source = this.personas.get(id);
    if (!source) return null;
    return this.create({
      name: `${source.name} (Copy)`,
      systemPrompt: source.systemPrompt,
      model: source.model,
      avatar: source.avatar,
      temperature: source.temperature,
      maxTokens: source.maxTokens,
    });
  }

  getDefaults(): Persona[] {
    const defaults: Omit<Persona, 'id' | 'createdAt' | 'isActive'>[] = [
      {
        name: 'Coder',
        systemPrompt: 'You are an expert programmer.',
        model: 'gpt-4',
        avatar: '💻',
        temperature: 0.2,
        maxTokens: 4096,
      },
      {
        name: 'Writer',
        systemPrompt: 'You are a creative writer.',
        model: 'gpt-4',
        avatar: '✍️',
        temperature: 0.8,
        maxTokens: 4096,
      },
      {
        name: 'Analyst',
        systemPrompt: 'You are a data analyst.',
        model: 'gpt-4',
        avatar: '📊',
        temperature: 0.3,
        maxTokens: 4096,
      },
      {
        name: 'Tutor',
        systemPrompt: 'You are a patient teacher.',
        model: 'gpt-4',
        avatar: '🎓',
        temperature: 0.5,
        maxTokens: 4096,
      },
    ];
    return defaults.map((d) => this.create(d));
  }
}
