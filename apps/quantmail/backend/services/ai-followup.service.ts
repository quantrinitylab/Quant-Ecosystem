import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { UserCommitmentMemory } from '@quant/ai';
import type { UserCommitment } from '@quant/ai';
import type { RememberingMemoryBackend } from './ai-style-learner.service';
import { createAppError } from '@quant/server-core';

export const EmailInputSchema = z.object({
  id: z.string(),
  subject: z.string(),
  body: z.string(),
  from: z.string(),
  date: z.string(),
});

export const CommitmentSchema = z.object({
  description: z.string(),
  dueDate: z.string().optional(),
  assignee: z.string(),
  confidence: z.number().min(0).max(1),
  emailId: z.string(),
});

export const ReminderSchema = z.object({
  id: z.string(),
  commitmentDescription: z.string(),
  dueDate: z.string(),
  userId: z.string(),
  status: z.enum(['active', 'completed', 'dismissed']),
  createdAt: z.string(),
});

export type EmailInput = z.infer<typeof EmailInputSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;

// ─── Reminder persistence port (flagship memory integration) ────────────────
// A commitment ("I'll send X by Friday") is episodic user memory with a due
// date. Losing reminders on restart defeats the entire follow-up feature.

export interface ReminderStore {
  save(reminder: Reminder): Promise<void>;
  listActive(userId: string): Promise<Reminder[]>;
}

/** Default store: the original ephemeral Map. Byte-identical behavior. */
export class InMemoryReminderStore implements ReminderStore {
  private reminders = new Map<string, Reminder>();
  async save(reminder: Reminder): Promise<void> {
    this.reminders.set(reminder.id, reminder);
  }
  async listActive(userId: string): Promise<Reminder[]> {
    return Array.from(this.reminders.values()).filter(
      (r) => r.userId === userId && r.status === 'active',
    );
  }
}

/**
 * Persists reminders through the SHARED UserCommitmentMemory channel
 * (@quant/ai): commitments made in mail live beside commitments made in
 * meetings (QuantMeet) and are consumable by any surface. Append-only
 * status semantics are provided by the channel itself.
 */
export class MemoryBackedReminderStore implements ReminderStore {
  private readonly channel: UserCommitmentMemory;
  constructor(memory: RememberingMemoryBackend) {
    this.channel = new UserCommitmentMemory(memory);
  }

  async save(reminder: Reminder): Promise<void> {
    await this.channel.add({
      id: reminder.id,
      userId: reminder.userId,
      description: reminder.commitmentDescription,
      dueDate: reminder.dueDate,
      source: 'quantmail',
      status: reminder.status,
      createdAt: reminder.createdAt,
    });
  }

  async listActive(userId: string): Promise<Reminder[]> {
    const commitments = await this.channel.listActive(userId);
    return commitments.map((c: UserCommitment) => ({
      id: c.id,
      commitmentDescription: c.description,
      dueDate: c.dueDate ?? '',
      userId: c.userId,
      status: c.status,
      createdAt: c.createdAt,
    }));
  }
}

export class AIFollowupService {
  /** Reminder persistence port. Default preserves the original behavior. */
  private readonly store: ReminderStore;

  constructor(
    private readonly ai: AIEngine,
    store?: ReminderStore,
  ) {
    this.store = store ?? new InMemoryReminderStore();
  }

  async detectCommitments(email: EmailInput, userId: string): Promise<Commitment[]> {
    const validated = EmailInputSchema.parse(email);

    const response = await this.ai.infer({
      prompt: `Detect any commitments or promises in this email (e.g., "I'll send X by Friday", "Let me get back to you").

Email:
From: ${validated.from}
Subject: ${validated.subject}
Date: ${validated.date}
Body: ${validated.body}

Respond ONLY with valid JSON array:
[
  {
    "description": "what was committed to",
    "dueDate": "ISO date string or null",
    "assignee": "who made the commitment",
    "confidence": 0.0 to 1.0,
    "emailId": "${validated.id}"
  }
]`,
      systemPrompt:
        'You are an assistant that detects commitments and promises in emails. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-followup',
      temperature: 0.2,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError(
        'Failed to parse AI commitment detection response',
        500,
        'AI_PARSE_ERROR',
      );
    }

    const result = z.array(CommitmentSchema).safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid commitment result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async createReminder(commitment: Commitment, userId: string): Promise<Reminder> {
    const id = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const reminder: Reminder = {
      id,
      commitmentDescription: commitment.description,
      dueDate: commitment.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    await this.store.save(reminder);
    return reminder;
  }

  async getActiveReminders(userId: string): Promise<Reminder[]> {
    return this.store.listActive(userId);
  }
}
