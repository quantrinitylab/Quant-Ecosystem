// ============================================================================
// Regression test — every launcher game resolves to a real, protocol-compliant
// playable file.
//
// The in-chat games system (GameLauncher + useGameSdk + lib/games-sdk) was fully
// wired, but the games referenced by DEFAULT_GAMES (e.g. /games/cosmic-tictactoe/
// index.html) did not exist in public/, so launching any game 404'd and timed
// out. This test guards against that regression by asserting:
//
//   1. Every DEFAULT_GAMES `url` maps to a real file under public/.
//   2. Each game HTML loads the shared SDK and speaks the `quant-game` protocol
//      (announces `ready` and reports `game_over`) with its own gameId.
//   3. A representative game_over payload validates + formats via the host's
//      pure SDK helpers (isGameMessage / formatGameScoreMessage).
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  isGameMessage,
  formatGameScoreMessage,
  awardGameXp,
  type GameDefinition,
  type GameOverPayload,
} from '../lib/games-sdk';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../');
const launcherSrc = readFileSync(resolve(appRoot, 'src/components/games/GameLauncher.tsx'), 'utf8');

/** Extract DEFAULT_GAMES { id, url } pairs from the launcher source (no React import). */
function parseLauncherGames(): Array<{ id: string; url: string }> {
  const block = launcherSrc.slice(
    launcherSrc.indexOf('DEFAULT_GAMES'),
    launcherSrc.indexOf('export interface GameLauncherProps'),
  );
  const games: Array<{ id: string; url: string }> = [];
  const re = /id:\s*'([^']+)'[\s\S]*?url:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    games.push({ id: m[1], url: m[2] });
  }
  return games;
}

const games = parseLauncherGames();

describe('in-chat games are actually playable', () => {
  it('discovers the launcher games', () => {
    expect(games.length).toBeGreaterThanOrEqual(3);
    expect(games.map((g) => g.id)).toEqual(
      expect.arrayContaining(['cosmic-tictactoe', 'nebula-trivia', 'quantum-pong']),
    );
  });

  it('ships the shared game SDK helper', () => {
    expect(existsSync(resolve(appRoot, 'public/games/_shared/quant-game.js'))).toBe(true);
  });

  for (const game of games) {
    describe(`game: ${game.id}`, () => {
      // url is an absolute public path like /games/<id>/index.html
      const filePath = resolve(appRoot, 'public', game.url.replace(/^\//, ''));

      it('has a real playable file', () => {
        expect(existsSync(filePath)).toBe(true);
      });

      it('loads the shared SDK and speaks the quant-game protocol', () => {
        const html = readFileSync(filePath, 'utf8');
        expect(html).toContain('_shared/quant-game.js');
        // Announces readiness with its own id (clears the host's 10s load timeout).
        expect(html).toContain(`QuantGame.ready(GAME_ID)`);
        expect(html).toContain(`'${game.id}'`);
        // Reports a final score so the host can post results + award XP.
        expect(html).toMatch(/QuantGame\.gameOver\(GAME_ID/);
      });
    });
  }

  it('a representative game_over payload round-trips through host SDK helpers', () => {
    const def: GameDefinition = {
      id: 'cosmic-tictactoe',
      name: 'Cosmic Tic-Tac-Toe',
      description: '',
      icon: '🛸',
      url: '/games/cosmic-tictactoe/index.html',
      minPlayers: 2,
      maxPlayers: 2,
    };
    const payload: GameOverPayload = {
      gameId: def.id,
      sessionId: 'gs_test',
      scores: [
        { userId: 'local', displayName: 'You', score: 250 },
        { userId: 'cosmic-ai', displayName: 'Cosmic AI', score: 100 },
      ],
    };

    expect(isGameMessage({ source: 'quant-game', type: 'game_over', payload })).toBe(true);

    const text = formatGameScoreMessage(def, payload.scores);
    expect(text).toContain('Winner: You');
    expect(text.indexOf('You')).toBeLessThan(text.indexOf('Cosmic AI')); // ranked

    const awards = awardGameXp(payload.scores);
    expect(awards.local).toBe(25); // floor(250 / 10)
    expect(awards['cosmic-ai']).toBe(10);
  });
});
