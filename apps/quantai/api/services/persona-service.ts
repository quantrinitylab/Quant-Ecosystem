// ============================================================================
// QuantAI - Persona Service
// Custom AI personas: creation, training, personality configuration
// ============================================================================

interface PersonaConfig {
  id: string;
  name: string;
  avatar: string;
  description: string;
  personality: string;
  tone: { formality: number; seriousness: number; detail: number };
  knowledgeFiles: string[];
  isShared: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  systemPrompt: string;
}

interface PersonaCreateInput {
  name: string;
  avatar: string;
  description: string;
  personality: string;
  tone: { formality: number; seriousness: number; detail: number };
  knowledgeFiles?: string[];
  isShared?: boolean;
}

interface PersonaResponse {
  id: string;
  content: string;
  personaId: string;
  timestamp: Date;
  tokens: number;
}

export class PersonaService {
  private personas: Map<string, PersonaConfig> = new Map();

  async createPersona(userId: string, input: PersonaCreateInput): Promise<PersonaConfig> {
    const systemPrompt = this.buildSystemPrompt(input);
    const persona: PersonaConfig = {
      id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      avatar: input.avatar,
      description: input.description,
      personality: input.personality,
      tone: input.tone,
      knowledgeFiles: input.knowledgeFiles || [],
      isShared: input.isShared || false,
      ownerId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      systemPrompt,
    };
    this.personas.set(persona.id, persona);
    return persona;
  }

  async getPersona(personaId: string): Promise<PersonaConfig | null> {
    return this.personas.get(personaId) || null;
  }

  async listPersonas(userId: string): Promise<PersonaConfig[]> {
    return Array.from(this.personas.values()).filter(
      p => p.ownerId === userId || p.isShared
    );
  }

  async updatePersona(personaId: string, userId: string, updates: Partial<PersonaCreateInput>): Promise<PersonaConfig | null> {
    const persona = this.personas.get(personaId);
    if (!persona || persona.ownerId !== userId) return null;

    const updated: PersonaConfig = {
      ...persona,
      ...updates,
      tone: updates.tone || persona.tone,
      updatedAt: new Date(),
      systemPrompt: this.buildSystemPrompt({ ...persona, ...updates } as PersonaCreateInput),
    };
    this.personas.set(personaId, updated);
    return updated;
  }

  async deletePersona(personaId: string, userId: string): Promise<boolean> {
    const persona = this.personas.get(personaId);
    if (!persona || persona.ownerId !== userId) return false;
    this.personas.delete(personaId);
    return true;
  }

  async chatWithPersona(personaId: string, message: string): Promise<PersonaResponse> {
    const persona = this.personas.get(personaId);
    if (!persona) throw new Error('Persona not found');

    persona.messageCount++;
    persona.updatedAt = new Date();

    const response: PersonaResponse = {
      id: `resp-${Date.now()}`,
      content: this.generatePersonaResponse(persona, message),
      personaId,
      timestamp: new Date(),
      tokens: Math.ceil(message.length / 4) + 50,
    };
    return response;
  }

  async uploadKnowledge(personaId: string, fileName: string, content: string): Promise<boolean> {
    const persona = this.personas.get(personaId);
    if (!persona) return false;
    persona.knowledgeFiles.push(fileName);
    persona.updatedAt = new Date();
    return true;
  }

  async toggleShare(personaId: string, userId: string): Promise<boolean> {
    const persona = this.personas.get(personaId);
    if (!persona || persona.ownerId !== userId) return false;
    persona.isShared = !persona.isShared;
    return true;
  }

  private buildSystemPrompt(input: PersonaCreateInput): string {
    const formalityDesc = input.tone.formality > 70 ? 'formal and professional' : input.tone.formality > 30 ? 'balanced' : 'casual and friendly';
    const seriousnessDesc = input.tone.seriousness > 70 ? 'serious and focused' : input.tone.seriousness > 30 ? 'moderate' : 'playful and light-hearted';
    const detailDesc = input.tone.detail > 70 ? 'provide detailed, comprehensive answers' : input.tone.detail > 30 ? 'give moderate detail' : 'keep responses brief and concise';

    return `You are ${input.name}. ${input.description}\n\nPersonality: ${input.personality}\n\nCommunication style: Be ${formalityDesc}, ${seriousnessDesc}. ${detailDesc}.`;
  }

  private generatePersonaResponse(persona: PersonaConfig, message: string): string {
    const prefix = persona.tone.formality > 70 ? 'I appreciate your question. ' : persona.tone.formality > 30 ? '' : 'Hey! ';
    const suffix = persona.tone.detail > 70 ? ' Would you like me to elaborate further on any of these points?' : '';
    return `${prefix}Based on my expertise as ${persona.name}, here is my response to "${message.slice(0, 50)}..."${suffix}`;
  }
}

export default new PersonaService();
