// @vitest-environment node
// (node env: the real auth plugin verifies HS256 via jose/WebCrypto, which the
// default jsdom environment breaks. No DOM APIs are used in this file.)
// ============================================================================
// F-043 — Paid voice endpoints must fail closed without authentication.
// Unauthenticated callers must get 401 BEFORE any STT/TTS provider call, so no
// provider credits can be burned. Covers missing / malformed / expired tokens,
// plus input edge cases (empty body, oversized TTS text).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { authPlugin } from '@quant/server-core';

const { textToSpeechMock, speechToTextMock, processVoiceCommandMock } = vi.hoisted(() => ({
  textToSpeechMock: vi.fn(async (_text: string) => Buffer.from('fake-audio-bytes')),
  speechToTextMock: vi.fn(async (_buf: Buffer) => 'fake transcript'),
  processVoiceCommandMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@quant/agentic', () => ({
  voiceInterface: {
    textToSpeech: textToSpeechMock,
    speechToText: speechToTextMock,
    processVoiceCommand: processVoiceCommandMock,
    isBackendConfigured: () => false,
  },
}));

import voiceRoutes, { MAX_TTS_TEXT_CHARS } from '../routes/voice';
import voiceFlowsRoutes from '../routes/voice-flows';
import * as ttsService from '../services/voiceover-tts.service';
import type { VoiceFlowGraph } from '../services/voice-flow.service';

// ---------------------------------------------------------------------------
// Test JWT minting (real HS256 — verified by the real auth plugin via jose).
// ---------------------------------------------------------------------------
const JWT_SECRET = 'f043-test-secret-not-a-real-secret';

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function mintToken(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function validToken(sub = 'user-1'): string {
  const now = Math.floor(Date.now() / 1000);
  return mintToken({
    sub,
    iss: 'quantai',
    aud: 'quant-ecosystem',
    iat: now,
    exp: now + 3600,
  });
}

function expiredToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return mintToken({
    sub: 'user-1',
    iss: 'quantai',
    aud: 'quant-ecosystem',
    iat: now - 7200,
    exp: now - 3600,
  });
}

const authHeaders = () => ({ authorization: `Bearer ${validToken()}` });

async function buildApp() {
  const app = Fastify();
  await app.register(authPlugin, {
    jwtSecret: JWT_SECRET,
    jwtIssuer: 'quantai',
    jwtAudience: 'quant-ecosystem',
  });
  await app.register(voiceRoutes, { prefix: '/voice' });
  await app.register(voiceFlowsRoutes, { prefix: '/api/voice-flows' });
  await app.ready();
  return app;
}

const validGraph: VoiceFlowGraph = {
  id: 'flow-1',
  name: 'Test Flow',
  entryNodeId: 'node-greeting',
  nodes: [
    {
      id: 'node-greeting',
      type: 'greeting',
      label: 'Greeting',
      config: { message: 'Hello!' },
    },
    {
      id: 'node-hangup',
      type: 'hangup',
      label: 'Hangup',
      config: { message: 'Goodbye!' },
    },
  ],
  edges: [
    { id: 'edge-1', sourceNodeId: 'node-greeting', targetNodeId: 'node-hangup' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-043: paid voice endpoints require authentication', () => {
  describe('POST /voice/tts', () => {
    it('unauthenticated -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(401);
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('malformed token -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: { authorization: 'Bearer not-a-jwt' },
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(401);
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('expired token -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: { authorization: `Bearer ${expiredToken()}` },
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(401);
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('authenticated but missing text -> 400, provider not called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: authHeaders(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('authenticated but empty text -> 400, provider not called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: authHeaders(),
        payload: { text: '   ' },
      });
      expect(res.statusCode).toBe(400);
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('authenticated but oversized text -> 400, provider not called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: authHeaders(),
        payload: { text: 'x'.repeat(MAX_TTS_TEXT_CHARS + 1) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain(String(MAX_TTS_TEXT_CHARS));
      expect(textToSpeechMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('authenticated with valid text -> 200 and provider called once', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: authHeaders(),
        payload: { text: 'hello world' },
      });
      expect(res.statusCode).toBe(200);
      expect(textToSpeechMock).toHaveBeenCalledTimes(1);
      expect(textToSpeechMock).toHaveBeenCalledWith('hello world');
      expect(res.headers['content-type']).toBe('audio/mpeg');
      await app.close();
    });
  });

  describe('POST /voice/stt', () => {
    it('unauthenticated -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/voice/stt' });
      expect(res.statusCode).toBe(401);
      expect(speechToTextMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('malformed token -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/stt',
        headers: { authorization: 'Bearer garbage' },
      });
      expect(res.statusCode).toBe(401);
      expect(speechToTextMock).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POST /voice/synthesize', () => {
    it('unauthenticated -> 401 and provider is never called', async () => {
      const app = await buildApp();
      const spy = vi.spyOn(ttsService, 'synthesizeSpeech');
      const res = await app.inject({
        method: 'POST',
        url: '/voice/synthesize',
        payload: { text: 'hi', voiceId: 'rachel' },
      });
      expect(res.statusCode).toBe(401);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      await app.close();
    });

    it('authenticated but missing voiceId -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/synthesize',
        headers: authHeaders(),
        payload: { text: 'hi' },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('authenticated with valid payload -> 200', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/synthesize',
        headers: authHeaders(),
        payload: { text: 'hello', voiceId: 'rachel' },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe('POST /voice/ssml', () => {
    it('unauthenticated -> 401', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/ssml',
        payload: { text: 'hi' },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('authenticated but missing text -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/ssml',
        headers: authHeaders(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('authenticated with valid payload -> 200 with ssml', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/ssml',
        headers: authHeaders(),
        payload: { text: 'hi' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ssml).toContain('<speak>');
      await app.close();
    });
  });

  describe('POST /voice/command', () => {
    it('unauthenticated -> 401 and voice command never processed', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/command',
        payload: { audio: Buffer.from('pcm').toString('base64') },
      });
      expect(res.statusCode).toBe(401);
      expect(processVoiceCommandMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('expired token -> 401', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/voice/command',
        headers: { authorization: `Bearer ${expiredToken()}` },
        payload: { audio: Buffer.from('pcm').toString('base64') },
      });
      expect(res.statusCode).toBe(401);
      expect(processVoiceCommandMock).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POST /api/voice-flows/validate', () => {
    it('unauthenticated -> 401', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/voice-flows/validate',
        payload: { graph: validGraph },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('authenticated with valid graph -> 200', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/voice-flows/validate',
        headers: authHeaders(),
        payload: { graph: validGraph },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      await app.close();
    });

    it('authenticated but missing graph -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/voice-flows/validate',
        headers: authHeaders(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /api/voice-flows/simulate', () => {
    it('unauthenticated -> 401', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/voice-flows/simulate',
        payload: { graph: validGraph, currentNodeId: 'node-greeting' },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('authenticated with valid payload -> 200', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/voice-flows/simulate',
        headers: authHeaders(),
        payload: { graph: validGraph, currentNodeId: 'node-greeting' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      await app.close();
    });
  });

  describe('public read-only endpoints stay public', () => {
    it('GET /voice/status works without a token', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/voice/status' });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('GET /voice/voices works without a token', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/voice/voices' });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });
});
