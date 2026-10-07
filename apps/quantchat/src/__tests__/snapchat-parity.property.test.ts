import { describe, it, expect } from 'vitest';
import { CHAT_THEMES, getChatTheme, themeToCssVars } from '../lib/chat-themes';
import {
  awardGameXp,
  formatGameScoreMessage,
  gameXpForScore,
  GAME_XP_DIVISOR,
  type GameDefinition,
  type GameScore,
} from '../lib/games-sdk';

// ----------------------------------------------------------------------------
// Deterministic, seedable PRNG (mulberry32) so any failure is reproducible.
// ----------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

// ============================================================================
// Feature: quantchat-mega-upgrade, Property 36: Chat theme syncs to all participants.
//
// Validates: Requirements 14.3.
//
// Property: For any conversation with a theme applied, all participants SHALL
// see the same theme configuration after sync. Theme application is driven by
// the pure resolution path (getChatTheme + themeToCssVars), which is keyed only
// by themeId. We assert that resolving the SAME themeId for an arbitrary number
// of participants yields byte-for-byte identical CSS variables — i.e. a single
// shared theme config that is identical for everyone.
// ============================================================================
describe('Chat theme syncs to all participants (Property 36)', () => {
  it('resolves identical theme CSS vars for every participant across >=100 cases', () => {
    const rand = mulberry32(0x36a17e);
    const themeIds = CHAT_THEMES.map((t) => t.id);
    // Include some unknown ids to exercise the shared default fallback path.
    const candidateIds = [...themeIds, 'does-not-exist', '', 'null-theme'];
    let cases = 0;

    for (let i = 0; i < 150; i++) {
      const themeId = candidateIds[randInt(rand, 0, candidateIds.length - 1)];
      const participantCount = randInt(rand, 1, 12);

      // Each participant independently resolves the conversation's themeId.
      const resolved = Array.from({ length: participantCount }, () =>
        themeToCssVars(getChatTheme(themeId)),
      );

      const reference = JSON.stringify(resolved[0]);
      for (let p = 1; p < resolved.length; p++) {
        expect(
          JSON.stringify(resolved[p]),
          `case #${i} themeId="${themeId}" participant ${p} diverged`,
        ).toBe(reference);
      }
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('different valid themeIds map to a single deterministic config (no per-participant drift)', () => {
    const rand = mulberry32(0x36b22d);
    for (let i = 0; i < 100; i++) {
      const theme = CHAT_THEMES[randInt(rand, 0, CHAT_THEMES.length - 1)];
      // Two participants, resolved at different "times": still identical.
      const a = themeToCssVars(getChatTheme(theme.id));
      const b = themeToCssVars(getChatTheme(theme.id));
      expect(a).toEqual(b);
    }
  });
});

// ============================================================================
// Feature: quantchat-mega-upgrade, Property 37: Game end awards XP and posts scores.
//
// Validates: Requirements 17.3.
//
// Property: For any game session ending with participant scores, the system
// SHALL post a chat message containing ALL participants' scores AND award each
// participant XP proportional to their score (design 10e: floor(score / 10)).
// We verify the two pure helpers that back this behaviour:
//   - formatGameScoreMessage includes every participant's name and score.
//   - awardGameXp awards floor(score / GAME_XP_DIVISOR) to each participant.
// ============================================================================
const TEST_GAME: GameDefinition = {
  id: 'quant-trivia',
  name: 'Quant Trivia',
  description: 'Test game',
  icon: '🎮',
  url: 'https://example.com/game',
  minPlayers: 2,
  maxPlayers: 8,
};

function generateScores(rand: () => number): GameScore[] {
  const n = randInt(rand, 1, 8);
  const scores: GameScore[] = [];
  for (let i = 0; i < n; i++) {
    scores.push({
      userId: `u${i}`,
      displayName: `Player_${i}`,
      // Mix in zero and large scores to exercise the proportional rule.
      score: randInt(rand, 0, 1000),
    });
  }
  return scores;
}

describe('Game end awards XP and posts scores (Property 37)', () => {
  it('posts a message containing every participant score across >=100 cases', () => {
    const rand = mulberry32(0x37c0de);
    let cases = 0;

    for (let i = 0; i < 120; i++) {
      const scores = generateScores(rand);
      const message = formatGameScoreMessage(TEST_GAME, scores);

      for (const s of scores) {
        expect(message.includes(s.displayName), `case #${i} missing name ${s.displayName}`).toBe(
          true,
        );
        expect(message.includes(String(s.score)), `case #${i} missing score ${s.score}`).toBe(true);
      }
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('awards each participant XP proportional to score across >=100 cases', () => {
    const rand = mulberry32(0x37dead);
    let cases = 0;

    for (let i = 0; i < 120; i++) {
      const scores = generateScores(rand);
      const awards = awardGameXp(scores);

      // One award per participant.
      expect(Object.keys(awards).length).toBe(scores.length);

      for (const s of scores) {
        const expected = Math.floor(s.score / GAME_XP_DIVISOR);
        expect(awards[s.userId], `case #${i} XP for ${s.userId}`).toBe(expected);
        // Monotonic / proportional: higher score never yields less XP.
        expect(gameXpForScore(s.score)).toBe(expected);
      }
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('clamps negative/zero scores to zero XP', () => {
    expect(gameXpForScore(0)).toBe(0);
    expect(gameXpForScore(-50)).toBe(0);
    expect(gameXpForScore(9)).toBe(0);
    expect(gameXpForScore(10)).toBe(1);
  });
});
