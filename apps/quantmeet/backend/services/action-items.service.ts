import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { TranscriptSegment } from './transcript.service';
import type { TranscriptService } from './transcript.service';

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Local AIInference interface for scaffold purposes.
 * This interface mirrors the patterns in @quant/ai and should be aligned
 * with the actual @quant/ai package types in a future integration pass.
 */
export interface AIInference {
  generateText(prompt: string): Promise<string>;
}

export class ActionItemsService {
  constructor(private readonly ai: AIInference) {}

  async extractActionItems(transcript: TranscriptSegment[]): Promise<ActionItem[]> {
    if (transcript.length === 0) {
      throw createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT');
    }

    const transcriptText = transcript.map((s) => `[${s.participantId}]: ${s.text}`).join('\n');

    const prompt = `Extract action items from the following meeting transcript. For each item, identify the title, description, assignee, due date, and priority.\n\nTranscript:\n${transcriptText}`;
    const result = await this.ai.generateText(prompt);

    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    const items: ActionItem[] = lines.map((line) => ({
      id: randomUUID(),
      title: line.trim(),
      description: '',
      assignee: null,
      dueDate: null,
      priority: 'medium' as const,
      status: 'pending' as const,
    }));

    return items;
  }

  async extractFromRoomId(
    roomId: string,
    transcriptService: TranscriptService,
  ): Promise<ActionItem[]> {
    const transcript = transcriptService.getTranscript(roomId);
    if (transcript.length === 0) {
      throw createAppError('No transcript found for room', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    return this.extractActionItems(transcript);
  }
}
