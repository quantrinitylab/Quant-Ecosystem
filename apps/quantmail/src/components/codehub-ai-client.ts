'use client';

import { readAIIntent, clientTimeoutForIntent } from '../lib/ai-intent-preference';
import { browserAuthSession } from '../services/browser-auth-session';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { message?: string };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const intent = readAIIntent();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), clientTimeoutForIntent(intent));

  try {
    const response = await browserAuthSession.authenticatedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !payload?.success || payload.data === undefined) {
      throw new Error(payload?.error?.message ?? `AI request failed (${response.status})`);
    }
    return payload.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The AI request timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function requestCodeHubAI(prompt: string): Promise<string> {
  const intent = readAIIntent();
  const data = await post<{ message?: string }>('/api/ai/chat', {
    messages: [{ role: 'user', content: prompt.slice(0, 6000) }],
    intent,
    context: { app: 'QuantMail', view: 'CodeHub AI developer tool' },
  });
  if (!data.message?.trim()) throw new Error('The AI service returned an empty response.');
  return data.message.trim();
}

export async function requestCommitMessage(diff: string): Promise<string[]> {
  const data = await post<{ message?: string; body?: string | null }>('/api/v1/commit-message', {
    diff: diff.slice(0, 100000),
    context: 'QuantMail CodeHub commit message generator',
  });
  if (!data.message?.trim()) throw new Error('The AI service returned an empty commit message.');
  return [data.message, data.body ? `${data.message}\n\n${data.body}` : null].filter(
    (value): value is string => Boolean(value),
  );
}

export function extractCode(text: string): string {
  const match = text.match(/```(?:[\w.+-]+)?\s*\n([\s\S]*?)```/);
  return (match?.[1] ?? text).trim();
}

export function parseAIJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI service returned invalid structured data.');
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The AI request failed. Please try again.';
}
