// Regression test: QuantGit demo fixtures must not claim an unshipped
// "voice AI agent" capability (same invented-inference class as the ONNX
// claims — fixed #1249). No voice AI agent ships in QuantMail, so any such
// string in these fixtures is an invented capability claim. Honest demo copy
// only: voice-call infrastructure (LiveKit gateway, SFU, call alerts) is fine,
// autonomous voice agents/bots are not.
import { describe, it, expect } from 'vitest';
import {
  INITIAL_REPOS,
  MOCK_FILES,
  INITIAL_DISCUSSIONS,
} from '../app/quantgit/constants';

const VOICE_AI_AGENT_CLAIM = /voice[-\s]*ai[-\s]*agent|voice\s+agents|voice-ai|voice-bot|voicebot/i;

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(allStrings);
  return [];
}

describe('QuantGit fixture copy honesty (no unshipped voice-AI-agent claims)', () => {
  it('INITIAL_REPOS contains no voice-AI-agent / voice-bot / voice-ai claims', () => {
    const hits = allStrings(INITIAL_REPOS).filter((s) =>
      VOICE_AI_AGENT_CLAIM.test(s),
    );
    expect(hits).toEqual([]);
  });

  it('quantchat-meet description is honest and drops the voice AI agent claim', () => {
    const meet = INITIAL_REPOS.find((r) => r.id === 'quantchat-meet');
    expect(meet).toBeDefined();
    expect(meet!.description).not.toMatch(/voice/i);
    expect(meet!.description).toContain('LiveKit');
    expect(meet!.topics).not.toContain('voice-ai');
    expect(meet!.branches).not.toContain('feat/voice-bot');
  });

  it('MOCK_FILES commit messages contain no voice-agent claims', () => {
    const hits = MOCK_FILES.filter((f) => VOICE_AI_AGENT_CLAIM.test(f.lastCommit));
    expect(hits.map((f) => `${f.path}: ${f.lastCommit}`)).toEqual([]);
  });

  it('INITIAL_DISCUSSIONS titles and bodies contain no voice-AI-agent claims', () => {
    const hits = INITIAL_DISCUSSIONS.filter(
      (d) =>
        VOICE_AI_AGENT_CLAIM.test(d.title) || VOICE_AI_AGENT_CLAIM.test(d.body),
    );
    expect(hits.map((d) => d.title)).toEqual([]);
  });
});
