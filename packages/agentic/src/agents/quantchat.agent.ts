import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantChatClient } from '../clients/http-client.js';

// QC-F-465: owner contract (QuantChat backend, firsthand on origin/main):
// - Send: POST /conversations/:id/messages (app.ts prefix '/conversations' +
//   routes/messages.ts POST '/:id/messages'); body is sendMessageSchema —
//   `conversationId` is a PATH param, never a body field.
// - Smart replies: POST /ai/smart-replies (app.ts prefix '/ai' +
//   routes/ai.ts POST '/smart-replies'); body is SmartReplyInputSchema —
//   `recentMessages: [{sender, content}]` is required, there is no
//   `lastMessage` field.
// - Both owners answer with a `{ success: true, data: ... }` envelope and
//   HttpClient does NOT unwrap it: `response.data` is the whole envelope,
//   the payload lives at `response.data.data`.
// - Both routes require the caller's own QuantChat JWT. Without a token the
//   tools fail honestly (AUTH_REQUIRED) instead of firing a call that is
//   guaranteed to 401 — and smart replies NEVER fall back to fabricated
//   suggestions: a failure is `{ success: false, ..., suggestions: [] }`.
const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'file',
  'location',
  'snap_photo',
  'snap_video',
] as const;

export class QuantChatAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantchat-agent',
      name: 'QuantChat Agent',
      personality: 'Friendly, real-time, context-aware messaging assistant',
      // QC-F-465 §3.4: only capabilities backed by a real tool are declared.
      // create_group / manage_conversations / message_search /
      // presence_management had no tools at all — a declaration without a
      // tool is a fabricated claim (the planner plans against this list).
      // They return only together with a real tool (brief Slice-2/3).
      capabilities: ['send_message', 'smart_replies'],
    });

    this.httpClient = httpClient ?? createQuantChatClient();
    this.registerChatTools();
  }

  /**
   * QC-F-465 §3.5: the one honest way to give this agent a token — delegate
   * to its own HttpClient. The token must be the acting user's own
   * QuantChat JWT.
   *
   * WARNING (singleton): the module-level `orchestrator` exported from
   * packages/agentic is SHARED across all QuantAI requests. Calling
   * setAuthToken on the shared singleton's agent per-request would leak one
   * user's token into another user's calls. Only set a token on an agent
   * constructed for a single user/request context; per-request handoff for
   * the shared singleton is HARD-GATE-465-A (QuantAI lane).
   */
  setAuthToken(token: string): void {
    this.httpClient.setAuthToken(token);
  }

  private registerChatTools() {
    this.addTool({
      name: 'quantchat_send',
      description:
        'Send a message via QuantChat. Server-side plaintext path only — this tool does NOT provide end-to-end encryption and must not be presented as encrypted.',
      parameters: {
        conversationId: 'string',
        content: 'string',
        type: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantChatAgent] Sending message:', params);

        const conversationId = params?.conversationId;
        const content = params?.content;
        if (
          typeof conversationId !== 'string' ||
          conversationId.trim() === '' ||
          typeof content !== 'string' ||
          content.length === 0
        ) {
          // Planner steps carry only `{ goal }` — fail honestly, never
          // fabricate a send (QC-F-465 §3.1).
          return { success: false, error: 'MISSING_PARAMETERS' };
        }
        if (content.length > 10000) {
          return { success: false, error: 'INVALID_PARAMETERS' };
        }
        const type = params?.type ?? 'text';
        if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
          return { success: false, error: 'INVALID_PARAMETERS' };
        }
        if (!this.httpClient.hasAuthToken()) {
          return { success: false, error: 'AUTH_REQUIRED' };
        }

        const body: Record<string, unknown> = { content, type };
        if (typeof params?.mediaUrl === 'string') body['mediaUrl'] = params.mediaUrl;
        if (typeof params?.replyToId === 'string') body['replyToId'] = params.replyToId;
        if (typeof params?.disappearMode === 'string') body['disappearMode'] = params.disappearMode;

        const response = await this.httpClient.post(
          `/conversations/${encodeURIComponent(conversationId)}/messages`,
          body,
        );

        if (!response.ok) {
          logger.warn('[QuantChatAgent] Failed to send message:', response.error);
          return { success: false, error: response.error, status: response.status };
        }

        // Envelope unwrap: owner answers 201 { success, data: message }.
        const message = (response.data as { data?: { id?: unknown; createdAt?: unknown } } | null)
          ?.data;
        if (typeof message?.id !== 'string' || typeof message?.createdAt !== 'string') {
          // No real receipt from the owner — never invent one (the old code
          // fabricated a timestamp with `new Date().toISOString()`).
          return { success: false, error: 'MALFORMED_RESPONSE' };
        }

        return {
          success: true,
          messageId: message.id,
          timestamp: message.createdAt,
        };
      },
    });

    this.addTool({
      name: 'quantchat_smart_reply',
      description:
        'Generate smart reply suggestions via QuantChat. Only for non-E2EE conversations: the recent messages are sent as plaintext to the server-side AI. On any failure this returns success:false with an empty suggestions list — it never invents suggestions.',
      parameters: {
        conversationId: 'string',
        recentMessages: 'array',
      },
      execute: async (params: any) => {
        logger.log('[QuantChatAgent] Generating smart replies:', params);

        const conversationId = params?.conversationId;
        const recentMessages = params?.recentMessages;
        if (
          typeof conversationId !== 'string' ||
          conversationId.trim() === '' ||
          !Array.isArray(recentMessages) ||
          recentMessages.length === 0 ||
          !recentMessages.every(
            (m: any) => m && typeof m.sender === 'string' && typeof m.content === 'string',
          )
        ) {
          return { success: false, error: 'MISSING_PARAMETERS', suggestions: [] };
        }
        if (!this.httpClient.hasAuthToken()) {
          return { success: false, error: 'AUTH_REQUIRED', suggestions: [] };
        }

        const body: Record<string, unknown> = { conversationId, recentMessages };
        if (typeof params?.count === 'number') body['count'] = params.count;
        if (typeof params?.participantEmail === 'string') {
          body['participantEmail'] = params.participantEmail;
        }

        const response = await this.httpClient.post('/ai/smart-replies', body);

        if (!response.ok) {
          logger.warn('[QuantChatAgent] Failed to get smart replies:', response.error);
          // QC-F-465 §3.3: honest failure. The fabricated fallback
          // suggestions are deleted — they were fake data presented as
          // real AI output.
          return {
            success: false,
            error: response.error,
            status: response.status,
            suggestions: [],
          };
        }

        // Envelope unwrap: owner answers 200 { success, data: { suggestions } }.
        const suggestions = (response.data as { data?: { suggestions?: unknown } } | null)?.data
          ?.suggestions;
        if (
          !Array.isArray(suggestions) ||
          !suggestions.every((s: unknown) => typeof s === 'string')
        ) {
          return { success: false, error: 'MALFORMED_RESPONSE', suggestions: [] };
        }

        return {
          success: true,
          suggestions,
        };
      },
    });
  }
}
