import { NextRequest } from 'next/server';
import { CrossAppOrchestrator, ContextManager, allTools } from '@quant/quant-tools';
import type { OrchestratorEvent, ToolPlanStep } from '@quant/quant-tools';
import { VoiceIntentBridge, SpeechToTextService } from '@quant/ai';

const MAX_INPUT_LENGTH = 2000;
const STREAM_TIMEOUT_MS = 30_000;

interface AskRequestBody {
  input: string;
  userId?: string;
  sessionId?: string;
  context?: {
    currentApp?: string;
    currentItem?: { id: string; type: string; title?: string };
  };
  dryRun?: boolean;
  voice?: boolean;
  audio?: string;
  /**
   * Explicit user confirmation for tool execution.
   * The client MUST set this after the user reviews the plan (dry-run)
   * and clicks Execute, or after responding to a confirmation dialog.
   * The server NEVER auto-confirms — tools requiring confirmation are
   * blocked unless the user explicitly confirmed them.
   */
  confirmed?: boolean;
  /** Specific step IDs the user confirmed (from a confirmation dialog). */
  confirmedSteps?: string[];
}

// NOTE: There is intentionally no mock/fallback STT service. A fabricated
// transcription (e.g. "[voice input]") would be executed as a real user
// command — misleading and unsafe. handleVoiceRequest returns 503 when no
// STT provider is configured.

export async function POST(request: NextRequest) {
  // Auth check: require Bearer token in Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing or invalid Bearer token' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const body = (await request.json()) as AskRequestBody;

  // Voice mode: decode audio and process via VoiceIntentBridge
  if (body.voice && body.audio) {
    return handleVoiceRequest(body);
  }

  if (!body.input || typeof body.input !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing required field: input' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Input length validation
  if (body.input.length > MAX_INPUT_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters` }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const userId = body.userId ?? 'anonymous';
  const sessionId = body.sessionId ?? `session-${Date.now()}`;

  const contextManager = new ContextManager({
    currentApp: body.context?.currentApp,
    currentItem: body.context?.currentItem,
  });

  const orchestrator = new CrossAppOrchestrator(allTools, contextManager);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const unsubscribe = orchestrator.on((event: OrchestratorEvent) => {
        sendEvent(event.type, event.data);
      });

      // Timeout guard: close stream if orchestrator stalls
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        sendEvent('error', { error: 'Stream timeout: orchestrator did not respond within 30s' });
        unsubscribe();
        controller.close();
      }, STREAM_TIMEOUT_MS);

      try {
        // Confirmation callback: NEVER auto-confirms. A tool step that
        // requires confirmation only proceeds when the user explicitly
        // confirmed it — either for the whole request (body.confirmed,
        // sent after the user reviews the dry-run plan and clicks Execute)
        // or for the specific step (body.confirmedSteps, sent after the
        // user accepts the in-flow confirmation dialog). Otherwise the
        // step is denied and a confirmation_required event is emitted so
        // the UI can prompt the user honestly.
        const confirmationCallback = async (step: ToolPlanStep): Promise<boolean> => {
          const stepId = step.stepId;
          if (body.confirmedSteps?.includes(stepId) || body.confirmed === true) {
            return true;
          }
          sendEvent('confirmation_required', { stepId, toolId: step.toolId });
          return false;
        };

        const result = await orchestrator.processNaturalLanguage(body.input, {
          userId,
          sessionId,
          dryRun: body.dryRun,
          confirmationCallback,
          enableRollback: true,
        });

        if (!timedOut) {
          sendEvent('done', { results: result.results, plan: result.plan });
        }
      } catch (err) {
        if (!timedOut) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          sendEvent('error', { error: message });
        }
      } finally {
        clearTimeout(timeout);
        if (!timedOut) {
          unsubscribe();
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function handleVoiceRequest(body: AskRequestBody) {
  const userId = body.userId ?? 'anonymous';
  const sessionId = body.sessionId ?? `session-${Date.now()}`;
  const audioBuffer = Buffer.from(body.audio!, 'base64');

  // Voice transcription requires a real STT provider. Never fabricate a
  // transcription — a fake "[voice input]" string would be executed as if
  // the user said it, which is both misleading and unsafe.
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'Voice transcription is not configured on this server. Please set OPENAI_API_KEY to enable voice input.',
        code: 'VOICE_NOT_CONFIGURED',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const contextManager = new ContextManager({
    currentApp: body.context?.currentApp,
    currentItem: body.context?.currentItem,
  });

  const orchestrator = new CrossAppOrchestrator(allTools, contextManager);

  const stt = new SpeechToTextService({ apiKey });

  const bridge = new VoiceIntentBridge(stt, orchestrator);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const unsubscribeBridge = bridge.on((event) => {
        sendEvent(event.type, event.data ?? {});
      });

      const unsubscribeOrchestrator = orchestrator.on((event: OrchestratorEvent) => {
        sendEvent(event.type, event.data);
      });

      try {
        const result = await bridge.processVoiceCommand(audioBuffer, userId, sessionId);
        sendEvent('done', result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendEvent('error', { error: message });
      } finally {
        unsubscribeBridge();
        unsubscribeOrchestrator();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
