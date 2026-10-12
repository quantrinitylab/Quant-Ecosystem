// @vitest-environment node
// (node env: the real auth plugin verifies HS256 via jose/WebCrypto, which the
// default jsdom environment breaks. No DOM APIs are used in this file.)
// ============================================================================
// QuantAI — F-046: POST /voice/tts must honor voiceId (persona -> real server voice)
//
// The voice UI posts { text, voiceId: <sovereign persona id> }. The route must
// thread voiceId through to the TTS provider instead of silently dropping it.
// Covers: persona->voice mapping, unknown/missing/invalid voiceId fallback,
// malformed bodies, and provider failure — plus a guard that the mapping only
// ever points at REAL provider voices (no invented ids).
//
// Consolidation note: /voice/tts is auth-gated (F-043's paidGuard), so these
// route tests register the real authPlugin and send a Bearer token — mirroring
// voice-paid-endpoints-auth.test.ts.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { authPlugin } from '@quant/server-core';
import voiceRoutes from '../routes/voice';
import {
  resolveServerTtsVoice,
  PERSONA_SERVER_VOICES,
  DEFAULT_SERVER_TTS_VOICE,
  SOVEREIGN_PERSONA_IDS,
} from '../services/persona-voice';
import { listAvailableVoices } from '../services/voiceover-tts.service';

// Mock the agentic voice backend. State lives INSIDE the factory (vitest hoists
// vi.mock above the module body, so outer variables would hit the TDZ).
vi.mock('@quant/agentic', () => {
  const ttsCalls: Array<{ voice: string; text: string }> = [];
  const ttsState = { fail: false };
  class AgentVoiceInterface {
    readonly config: { voice: string };
    constructor(config: { voice?: string } = {}) {
      this.config = { voice: config.voice ?? 'alloy' };
    }
    isBackendConfigured() {
      return true;
    }
    async textToSpeech(text: string): Promise<Buffer> {
      ttsCalls.push({ voice: this.config.voice, text });
      if (ttsState.fail) return Buffer.from([]);
      return Buffer.from(`AUDIO:${this.config.voice}:${text}`);
    }
    async speechToText() {
      return '';
    }
    async processVoiceCommand() {
      return {};
    }
  }
  return {
    AgentVoiceInterface,
    voiceInterface: new AgentVoiceInterface(),
    __ttsCalls: ttsCalls,
    __ttsState: ttsState,
  };
});

const mockedAgentic = (await import('@quant/agentic')) as unknown as {
  __ttsCalls: Array<{ voice: string; text: string }>;
  __ttsState: { fail: boolean };
};

describe('resolveServerTtsVoice (persona -> provider voice)', () => {
  it('maps each sovereign persona to a distinct real provider voice', () => {
    expect(resolveServerTtsVoice('aura')).toEqual({ voice: 'nova', known: true });
    expect(resolveServerTtsVoice('vesper')).toEqual({ voice: 'shimmer', known: true });
    expect(resolveServerTtsVoice('zenith')).toEqual({ voice: 'onyx', known: true });
    expect(resolveServerTtsVoice('zephyr')).toEqual({ voice: 'echo', known: true });
    const voices = Object.values(PERSONA_SERVER_VOICES);
    expect(new Set(voices).size).toBe(4); // distinct — personas sound different
  });

  it('matches case-insensitively and trims whitespace', () => {
    expect(resolveServerTtsVoice(' Aura ')).toEqual({ voice: 'nova', known: true });
    expect(resolveServerTtsVoice('VESPER')).toEqual({ voice: 'shimmer', known: true });
    expect(resolveServerTtsVoice('ZeNiTh')).toEqual({ voice: 'onyx', known: true });
  });

  it('falls back to the default voice on unknown, missing, or invalid voiceId', () => {
    for (const bad of ['jarvis', '', '   ', undefined, null, 42, {}, []]) {
      expect(resolveServerTtsVoice(bad)).toEqual({
        voice: DEFAULT_SERVER_TTS_VOICE,
        known: false,
      });
    }
    expect(DEFAULT_SERVER_TTS_VOICE).toBe('alloy');
  });

  it('only maps to REAL provider voices — no invented ids', () => {
    const catalog = listAvailableVoices();
    for (const [persona, voice] of Object.entries(PERSONA_SERVER_VOICES)) {
      const entry = catalog.find((v) => v.id === voice && v.provider === 'openai');
      expect(entry, `persona ${persona} maps to non-openai voice ${voice}`).toBeDefined();
    }
  });

  it('covers exactly the 4 sovereign persona ids', () => {
    expect(SOVEREIGN_PERSONA_IDS).toHaveLength(4);
    expect(new Set(SOVEREIGN_PERSONA_IDS).size).toBe(4);
    for (const id of SOVEREIGN_PERSONA_IDS) {
      expect(PERSONA_SERVER_VOICES[id]).toBeDefined();
    }
  });
});

// Test JWT minting (real HS256 — verified by the real auth plugin via jose).
const JWT_SECRET = 'test-jwt-secret-f046-consolidation';

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function validToken(sub = 'user-1'): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub, iss: 'quantai', aud: 'quant-ecosystem', iat: now, exp: now + 3600 }),
  );
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const authHeaders = () => ({ authorization: `Bearer ${validToken()}` });

describe('POST /voice/tts — voiceId reaches the provider', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    mockedAgentic.__ttsCalls.length = 0;
    mockedAgentic.__ttsState.fail = false;
    app = Fastify();
    await app.register(authPlugin, {
      jwtSecret: JWT_SECRET,
      jwtIssuer: 'quantai',
      jwtAudience: 'quant-ecosystem',
    });
    await app.register(voiceRoutes, { prefix: '/voice' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('uses the persona-mapped provider voice for each persona', async () => {
    const cases: Array<[string, string]> = [
      ['aura', 'nova'],
      ['vesper', 'shimmer'],
      ['zenith', 'onyx'],
      ['zephyr', 'echo'],
    ];
    for (const [persona, voice] of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/voice/tts',
        headers: authHeaders(),
        payload: { text: `Hello from ${persona}`, voiceId: persona },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('audio/mpeg');
      const call = mockedAgentic.__ttsCalls.at(-1)!;
      expect(call.voice).toBe(voice);
      expect(call.text).toBe(`Hello from ${persona}`);
      // The synthesized bytes themselves carry the selected voice.
      expect(res.rawBody?.toString() ?? res.body).toContain(`AUDIO:${voice}:`);
    }
  });

  it('falls back to the default voice on unknown voiceId (200, logged warning)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice/tts',
      headers: authHeaders(),
      payload: { text: 'Hello', voiceId: 'jarvis' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockedAgentic.__ttsCalls.at(-1)!.voice).toBe('alloy');
  });

  it('falls back to the default voice when voiceId is missing or not a string', async () => {
    for (const payload of [{ text: 'Hello' }, { text: 'Hello', voiceId: 42 }]) {
      const res = await app.inject({ method: 'POST', url: '/voice/tts', headers: authHeaders(), payload });
      expect(res.statusCode).toBe(200);
      expect(mockedAgentic.__ttsCalls.at(-1)!.voice).toBe('alloy');
    }
  });

  it('returns 400 when text is missing, empty, whitespace, or not a string', async () => {
    const payloads = [{}, { text: '' }, { text: '   ' }, { text: 42 }, { voiceId: 'aura' }];
    for (const payload of payloads) {
      const res = await app.inject({ method: 'POST', url: '/voice/tts', headers: authHeaders(), payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/text is required/);
    }
    expect(mockedAgentic.__ttsCalls).toHaveLength(0);
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice/tts',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: '{not valid json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with empty audio when the provider fails (client falls back to browser speech)', async () => {
    mockedAgentic.__ttsState.fail = true;
    const res = await app.inject({
      method: 'POST',
      url: '/voice/tts',
      headers: authHeaders(),
      payload: { text: 'Hello', voiceId: 'aura' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.rawBody?.length ?? res.body.length).toBe(0);
    // The persona voice was still selected before the provider failed.
    expect(mockedAgentic.__ttsCalls.at(-1)!.voice).toBe('nova');
  });
});
