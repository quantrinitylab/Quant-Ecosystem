// ============================================================================
// Unit tests — NeonGamesService (durable in-feed game sessions, Prisma-backed)
//
// NeonGamesService now persists game sessions to the Prisma `NeonGameSession`
// model (@@map neon_game_sessions) so sessions survive restarts and are shared
// across backend instances. A live PostgreSQL is not available in the sandbox,
// so — mirroring the repo's fake-prisma approach (see room.service.test.ts) —
// these tests drive the REAL NeonGamesService against a faithful in-memory model
// of the exact `neonGameSession` delegate operations it issues:
//
//   prisma.neonGameSession.create / findUnique / update / findMany
//
// `players` and `board` are JSON columns (arrays). Every session method is async
// (await / rejects). Covers: catalog, full Tic-Tac-Toe game (start -> join
// auto-activates -> alternating moves -> win), draw, NOT_YOUR_TURN, INVALID_MOVE
// (taken cell / out of range), SESSION_FULL, ALREADY_JOINED, GAME_NOT_PLAYABLE
// (uno/ludo), GAME_NOT_FOUND, leave/forfeit, listActiveSessions filtering, and
// SESSION_NOT_FOUND.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NeonGamesService, GameError } from '../services/neon-games.service';
import type { NeonGamePrisma, NeonGameSessionRow } from '../services/neon-games.service';
import { MonopolyEngine } from '@quant/cross-app-gaming';

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `neonGameSession` delegate.
// ---------------------------------------------------------------------------
function createFakeNeonGamePrisma(): NeonGamePrisma & { __rows: NeonGameSessionRow[] } {
  const rows: NeonGameSessionRow[] = [];
  let seq = 0;

  // Deep-ish clone so callers can't mutate stored rows by reference (mirrors
  // how Prisma returns fresh objects). players/board are JSON arrays.
  const clone = (row: NeonGameSessionRow): NeonGameSessionRow => ({
    ...row,
    players: Array.isArray(row.players) ? [...(row.players as unknown[])] : row.players,
    board: Array.isArray(row.board) ? [...(row.board as unknown[])] : row.board,
  });

  // Match the exact `where` shapes NeonGamesService issues for findMany:
  //   { state: { in: ['waiting','active'] } } (+ optional gameId).
  const matches = (row: NeonGameSessionRow, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    const stateClause = where['state'] as { in?: string[] } | undefined;
    if (stateClause?.in && !stateClause.in.includes(row.state)) return false;
    if ('gameId' in where && row.gameId !== where['gameId']) return false;
    return true;
  };

  return {
    neonGameSession: {
      async create({ data }) {
        const row: NeonGameSessionRow = {
          id: `gs_${(seq += 1)}`,
          gameId: String(data['gameId']),
          host: String(data['host']),
          players: (data['players'] as unknown) ?? [],
          state: (data['state'] as string) ?? 'waiting',
          turn: (data['turn'] as string | null) ?? null,
          board: (data['board'] as unknown) ?? [],
          winner: (data['winner'] as string | null) ?? null,
          isDraw: (data['isDraw'] as boolean) ?? false,
          createdAt: (data['createdAt'] as Date) ?? new Date(),
          updatedAt: (data['updatedAt'] as Date) ?? new Date(),
        };
        rows.push(row);
        return clone(row);
      },
      async findUnique({ where }) {
        const row = rows.find((r) => r.id === where.id);
        return row ? clone(row) : null;
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`No NeonGameSession row with id ${where.id}`);
        Object.assign(row, data);
        return clone(row);
      },
      async findMany({ where }) {
        return rows.filter((r) => matches(r, where)).map((r) => clone(r));
      },
    },
    __rows: rows,
  };
}

async function startAndFill(svc: NeonGamesService): Promise<{ id: string }> {
  const session = await svc.startGame('tic-tac-toe', 'alice');
  await svc.joinGame(session.id, 'bob');
  return session;
}

describe('NeonGamesService — durable in-feed game sessions', () => {
  let prisma: ReturnType<typeof createFakeNeonGamePrisma>;
  let svc: NeonGamesService;

  beforeEach(() => {
    prisma = createFakeNeonGamePrisma();
    svc = new NeonGamesService(prisma);
  });

  describe('catalog', () => {
    it('lists games and marks the catalog playable', () => {
      const games = svc.listGames();
      expect(games.find((g) => g.id === 'tic-tac-toe')?.status).toBe('playable');
      expect(games.find((g) => g.id === 'uno')?.status).toBe('playable');
      expect(games.find((g) => g.id === 'ludo')?.status).toBe('playable');
      expect(games.find((g) => g.id === 'monopoly')?.status).toBe('playable');
      expect(games.find((g) => g.id === 'connect-four')?.status).toBe('playable');
      expect(games.find((g) => g.id === 'othello')?.status).toBe('playable');
    });

    it('getGame returns the catalog entry or undefined', () => {
      expect(svc.getGame('tic-tac-toe')?.name).toBe('Tic-Tac-Toe');
      expect(svc.getGame('nope')).toBeUndefined();
    });
  });

  describe('session lifecycle', () => {
    it('starts a waiting session hosted by the caller and persists it', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      expect(s.id).toBeDefined();
      expect(s.state).toBe('waiting');
      expect(s.host).toBe('alice');
      expect(s.players).toEqual(['alice']);
      expect(s.board).toEqual(Array(9).fill(null));
      expect(s.turn).toBeNull();
      expect(prisma.__rows).toHaveLength(1);
    });

    it('refuses to start an unknown game (GAME_NOT_FOUND)', async () => {
      await expect(svc.startGame('nope', 'alice')).rejects.toMatchObject({
        code: 'GAME_NOT_FOUND',
      });
    });

    it('activates the session and sets the host to move first when the 2nd player joins', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      const joined = await svc.joinGame(s.id, 'bob');
      expect(joined.state).toBe('active');
      expect(joined.turn).toBe('alice');
      expect(joined.players).toEqual(['alice', 'bob']);
    });

    it('persists the join so a fresh read sees the active session', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      await svc.joinGame(s.id, 'bob');
      const reloaded = await svc.getSession(s.id);
      expect(reloaded.state).toBe('active');
      expect(reloaded.players).toEqual(['alice', 'bob']);
      expect(reloaded.turn).toBe('alice');
    });

    it('rejects joining a full/active session (SESSION_FULL or SESSION_NOT_ACTIVE)', async () => {
      const s = await startAndFill(svc);
      let caught: unknown;
      try {
        await svc.joinGame(s.id, 'carol');
        expect.unreachable();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(GameError);
      expect(['SESSION_FULL', 'SESSION_NOT_ACTIVE']).toContain((caught as GameError).code);
    });

    it('rejects double-join (ALREADY_JOINED)', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      await expect(svc.joinGame(s.id, 'alice')).rejects.toMatchObject({
        code: 'ALREADY_JOINED',
      });
    });

    it('throws SESSION_NOT_FOUND for an unknown session', async () => {
      await expect(svc.getSession('missing')).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
    });
  });

  describe('gameplay (tic-tac-toe)', () => {
    it('enforces turn order (NOT_YOUR_TURN)', async () => {
      const s = await startAndFill(svc);
      // bob tries to move first, but it's alice's turn
      await expect(svc.submitMove(s.id, 'bob', { cell: 0 })).rejects.toMatchObject({
        code: 'NOT_YOUR_TURN',
      });
    });

    it('rejects taking an occupied cell (INVALID_MOVE)', async () => {
      const s = await startAndFill(svc);
      await svc.submitMove(s.id, 'alice', { cell: 4 });
      await expect(svc.submitMove(s.id, 'bob', { cell: 4 })).rejects.toMatchObject({
        code: 'INVALID_MOVE',
      });
    });

    it('rejects an out-of-range cell (INVALID_MOVE)', async () => {
      const s = await startAndFill(svc);
      await expect(svc.submitMove(s.id, 'alice', { cell: 9 })).rejects.toMatchObject({
        code: 'INVALID_MOVE',
      });
      await expect(svc.submitMove(s.id, 'alice', { cell: -1 })).rejects.toMatchObject({
        code: 'INVALID_MOVE',
      });
    });

    it('plays a full game with alternating moves and detects a win, persisting each move', async () => {
      const s = await startAndFill(svc);
      // alice: 0,1,2 (top row); bob: 3,4
      await svc.submitMove(s.id, 'alice', { cell: 0 });
      const afterFirst = await svc.getSession(s.id);
      expect(afterFirst.board[0]).toBe('X');
      expect(afterFirst.turn).toBe('bob');

      await svc.submitMove(s.id, 'bob', { cell: 3 });
      await svc.submitMove(s.id, 'alice', { cell: 1 });
      await svc.submitMove(s.id, 'bob', { cell: 4 });
      const final = await svc.submitMove(s.id, 'alice', { cell: 2 });

      expect(final.state).toBe('finished');
      expect(final.winner).toBe('alice');
      expect(final.turn).toBeNull();

      // Durability: a fresh read reflects the finished game.
      const reloaded = await svc.getSession(s.id);
      expect(reloaded.state).toBe('finished');
      expect(reloaded.winner).toBe('alice');
      expect(reloaded.board).toEqual(['X', 'X', 'X', 'O', 'O', null, null, null, null]);
    });

    it('detects a draw', async () => {
      const s = await startAndFill(svc);
      // Fill to a draw: X=alice O=bob
      // board: X O X / X O O / O X X  -> no 3-in-a-row
      const moves: [string, number][] = [
        ['alice', 0],
        ['bob', 1],
        ['alice', 2],
        ['bob', 4],
        ['alice', 3],
        ['bob', 5],
        ['alice', 7],
        ['bob', 6],
        ['alice', 8],
      ];
      let last;
      for (const [u, c] of moves) last = await svc.submitMove(s.id, u, { cell: c });
      expect(last!.state).toBe('finished');
      expect(last!.isDraw).toBe(true);
      expect(last!.winner).toBeNull();
    });

    it('rejects moves after the game is finished (SESSION_NOT_ACTIVE)', async () => {
      const s = await startAndFill(svc);
      await svc.submitMove(s.id, 'alice', { cell: 0 });
      await svc.submitMove(s.id, 'bob', { cell: 3 });
      await svc.submitMove(s.id, 'alice', { cell: 1 });
      await svc.submitMove(s.id, 'bob', { cell: 4 });
      await svc.submitMove(s.id, 'alice', { cell: 2 }); // alice wins
      await expect(svc.submitMove(s.id, 'bob', { cell: 5 })).rejects.toMatchObject({
        code: 'SESSION_NOT_ACTIVE',
      });
    });
  });

  describe('leaving', () => {
    it('awards the win by forfeit when a player leaves an active game', async () => {
      const s = await startAndFill(svc);
      const after = await svc.leaveGame(s.id, 'bob');
      expect(after.state).toBe('finished');
      expect(after.winner).toBe('alice');
      expect(after.players).toEqual(['alice']);

      const reloaded = await svc.getSession(s.id);
      expect(reloaded.state).toBe('finished');
      expect(reloaded.winner).toBe('alice');
    });

    it('abandons a waiting session when the host leaves', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      const after = await svc.leaveGame(s.id, 'alice');
      expect(after.state).toBe('abandoned');
      expect(after.players).toEqual([]);
    });

    it('is a no-op for a user who is not in the session', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      const after = await svc.leaveGame(s.id, 'stranger');
      expect(after.state).toBe('waiting');
      expect(after.players).toEqual(['alice']);
    });
  });

  describe('listing', () => {
    it('lists active sessions filtered by game', async () => {
      await svc.startGame('tic-tac-toe', 'alice');
      await expect(svc.listActiveSessions('tic-tac-toe')).resolves.toHaveLength(1);
      await expect(svc.listActiveSessions('uno')).resolves.toHaveLength(0);
    });

    it('lists all active (waiting/active) sessions and excludes finished/abandoned', async () => {
      const a = await svc.startGame('tic-tac-toe', 'alice');
      const b = await svc.startGame('tic-tac-toe', 'carol');
      // Abandon one (host leaves a waiting session).
      await svc.leaveGame(b.id, 'carol');

      const active = await svc.listActiveSessions();
      expect(active.map((s) => s.id)).toEqual([a.id]);
    });

    it('includes a session that has auto-activated', async () => {
      const s = await svc.startGame('tic-tac-toe', 'alice');
      await svc.joinGame(s.id, 'bob');
      const active = await svc.listActiveSessions('tic-tac-toe');
      expect(active).toHaveLength(1);
      expect(active[0]!.state).toBe('active');
    });
  });
});

// ---------------------------------------------------------------------------
// Engine-backed games (Uno / Ludo / Monopoly) via @quant/cross-app-gaming
// ---------------------------------------------------------------------------

describe('NeonGamesService — engine games', () => {
  let prisma: ReturnType<typeof createFakeNeonGamePrisma>;
  let svc: NeonGamesService;

  beforeEach(() => {
    prisma = createFakeNeonGamePrisma();
    svc = new NeonGamesService(prisma);
  });

  it('auto-starts an Uno session and initializes engine state', async () => {
    const s = await svc.startGame('uno', 'alice');
    expect(s.state).toBe('waiting');
    const sess = await svc.joinGame(s.id, 'bob');
    expect(sess.state).toBe('active');
    expect(sess.turn).toBe('alice');
    expect(sess.engineState).toBeDefined();
  });

  it('rejects an Uno move from the wrong player (NOT_YOUR_TURN)', async () => {
    const s = await svc.startGame('uno', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(svc.submitMove(s.id, 'bob', { type: 'uno_draw' })).rejects.toMatchObject({
      code: 'NOT_YOUR_TURN',
    });
  });

  it('applies an Uno draw for the active player and persists state', async () => {
    const s = await svc.startGame('uno', 'alice');
    await svc.joinGame(s.id, 'bob');
    const sess = await svc.submitMove(s.id, 'alice', { type: 'uno_draw' });
    expect(sess.state).toBe('active');
    expect(sess.engineState).toBeDefined();
    const reloaded = await svc.getSession(s.id);
    expect(reloaded.engineState).toBeDefined();
  });

  it('auto-starts a Ludo session with the host on turn', async () => {
    const s = await svc.startGame('ludo', 'alice');
    const sess = await svc.joinGame(s.id, 'bob');
    expect(sess.state).toBe('active');
    expect(sess.turn).toBe('alice');
    expect(sess.engineState).toBeDefined();
  });

  it('rejects a Ludo roll from the wrong player', async () => {
    const s = await svc.startGame('ludo', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(svc.submitMove(s.id, 'bob', { type: 'ludo_roll' })).rejects.toThrowError(
      GameError,
    );
  });

  it('applies a Ludo roll for the active player', async () => {
    const s = await svc.startGame('ludo', 'alice');
    await svc.joinGame(s.id, 'bob');
    const sess = await svc.submitMove(s.id, 'alice', { type: 'ludo_roll' });
    expect(sess.engineState).toBeDefined();
    expect(['active', 'finished']).toContain(sess.state);
  });

  it('auto-starts a Monopoly session and applies a deterministic roll', async () => {
    const monopoly = new MonopolyEngine({ rollDie: () => 2, drawCard: () => 0 });
    const svc2 = new NeonGamesService(prisma, () => new Date(), { monopoly });
    const s = await svc2.startGame('monopoly', 'alice');
    const joined = await svc2.joinGame(s.id, 'bob');
    expect(joined.turn).toBe('alice');
    // 2 + 2 = 4 -> Income Tax; engine state advances and persists.
    const sess = await svc2.submitMove(s.id, 'alice', { type: 'monopoly_roll' });
    expect(sess.engineState).toBeDefined();
    expect(sess.state).toBe('active');
  });

  it('rejects a Monopoly roll from the wrong player (NOT_YOUR_TURN)', async () => {
    const s = await svc.startGame('monopoly', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(svc.submitMove(s.id, 'bob', { type: 'monopoly_roll' })).rejects.toMatchObject({
      code: 'NOT_YOUR_TURN',
    });
  });

  it('rejects engine moves before a session is active', async () => {
    const s = await svc.startGame('uno', 'alice');
    await expect(svc.submitMove(s.id, 'alice', { type: 'uno_draw' })).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
    });
  });

  it('auto-starts a Connect Four session with the host (R) on turn', async () => {
    const s = await svc.startGame('connect-four', 'alice');
    const sess = await svc.joinGame(s.id, 'bob');
    expect(sess.state).toBe('active');
    expect(sess.turn).toBe('alice');
    expect(sess.engineState).toBeDefined();
  });

  it('rejects a Connect Four drop from the wrong player', async () => {
    const s = await svc.startGame('connect-four', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(
      svc.submitMove(s.id, 'bob', { type: 'connect_four_drop', column: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('plays Connect Four to a vertical win for the host', async () => {
    const s = await svc.startGame('connect-four', 'alice');
    let sess = await svc.joinGame(s.id, 'bob');
    // alice stacks column 0; bob plays column 1 between.
    sess = await svc.submitMove(s.id, 'alice', { type: 'connect_four_drop', column: 0 });
    sess = await svc.submitMove(s.id, 'bob', { type: 'connect_four_drop', column: 1 });
    sess = await svc.submitMove(s.id, 'alice', { type: 'connect_four_drop', column: 0 });
    sess = await svc.submitMove(s.id, 'bob', { type: 'connect_four_drop', column: 1 });
    sess = await svc.submitMove(s.id, 'alice', { type: 'connect_four_drop', column: 0 });
    sess = await svc.submitMove(s.id, 'bob', { type: 'connect_four_drop', column: 1 });
    sess = await svc.submitMove(s.id, 'alice', { type: 'connect_four_drop', column: 0 });
    expect(sess.state).toBe('finished');
    expect(sess.winner).toBe('alice');
  });

  it('auto-starts an Othello session with the host (Black) on turn', async () => {
    const s = await svc.startGame('othello', 'alice');
    const sess = await svc.joinGame(s.id, 'bob');
    expect(sess.state).toBe('active');
    expect(sess.turn).toBe('alice');
    expect(sess.engineState).toBeDefined();
  });

  it('rejects an Othello move from the wrong player', async () => {
    const s = await svc.startGame('othello', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(
      svc.submitMove(s.id, 'bob', { type: 'othello_place', row: 2, col: 3 }),
    ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('applies a legal Othello move and flips a disc', async () => {
    const s = await svc.startGame('othello', 'alice');
    await svc.joinGame(s.id, 'bob');
    // Black's opening move (2,3) flanks the white disc at (3,3).
    const sess = await svc.submitMove(s.id, 'alice', { type: 'othello_place', row: 2, col: 3 });
    expect(sess.state).toBe('active');
    expect(sess.turn).toBe('bob');
    expect(sess.engineState).toBeDefined();
  });

  it('rejects an illegal Othello move (flips nothing)', async () => {
    const s = await svc.startGame('othello', 'alice');
    await svc.joinGame(s.id, 'bob');
    await expect(
      svc.submitMove(s.id, 'alice', { type: 'othello_place', row: 0, col: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_MOVE' });
  });
});
