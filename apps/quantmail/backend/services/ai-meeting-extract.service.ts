import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const MeetingEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  from: z.string(),
  date: z.string().optional(),
});

export const MeetingDetailsSchema = z.object({
  title: z.string(),
  date: z.string(),
  time: z.string(),
  duration: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()),
  agenda: z.string().optional(),
  isMeetingRequest: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional(),
  attendees: z.array(z.string()),
  description: z.string().optional(),
  status: z.enum(['created', 'pending', 'confirmed']),
});

export type MeetingEmail = z.infer<typeof MeetingEmailSchema>;
export type MeetingDetails = z.infer<typeof MeetingDetailsSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export class AIMeetingExtractService {
  constructor(private readonly ai: AIEngine) {}

  async extractMeetingDetails(email: MeetingEmail, userId: string): Promise<MeetingDetails> {
    const validated = MeetingEmailSchema.parse(email);

    const response = await this.ai.infer({
      prompt: `Analyze this email and extract meeting details if it contains a meeting request.

Email:
From: ${validated.from}
Subject: ${validated.subject}
Body: ${validated.body}

Respond ONLY with valid JSON:
{
  "title": "meeting title",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "duration": "e.g., 1 hour",
  "location": "location or null",
  "attendees": ["email1", "email2"],
  "agenda": "meeting agenda or null",
  "isMeetingRequest": true/false,
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a calendar assistant that extracts meeting details from emails. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'meeting-extract',
      temperature: 0.2,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI meeting extraction response', 500, 'AI_PARSE_ERROR');
    }

    const result = MeetingDetailsSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid meeting details', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async createCalendarEvent(details: MeetingDetails, userId: string): Promise<CalendarEvent> {
    const id = `evt_${crypto.randomUUID()}`;

    const startTime = `${details.date}T${details.time}:00Z`;
    const durationHours = details.duration ? parseFloat(details.duration) || 1 : 1;
    const endDate = new Date(new Date(startTime).getTime() + durationHours * 60 * 60 * 1000);

    return {
      id,
      title: details.title,
      startTime,
      endTime: endDate.toISOString(),
      location: details.location,
      attendees: details.attendees,
      description: details.agenda,
      status: 'created',
    };
  }
}
