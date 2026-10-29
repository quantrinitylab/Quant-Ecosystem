// ============================================================================
// QuantCooks Studio — Canvas Board home page (route: /studio/board,
// spec §6.1, checklist #47)
//
// Thin wiring, Unit 1 pattern: the shell and the mirror live here; all
// behaviour lives in the BoardHome component. Boards are device drafts
// (localStorage mirror, board.ts) — there is no server home for a board
// document yet — so the page loads them client-side and the component
// labels them "draft on this device". Creating a board or instantiating
// a template writes the mirror and the component navigates to the new
// board's route.
//
// Shell note: StudioShell's STUDIO_NAV lists Canvas Board as "in build"
// (href: null). This page makes the route real when navigated to
// directly; flipping that one nav entry to href '/studio/board' is a
// named follow-up for a unit allowed to edit StudioShell.tsx (this unit
// creates new files only).
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { BoardHome, type BoardHomeState } from '../../components/studio/BoardHome';
import {
  deleteBoard,
  emptyBoardDoc,
  instantiateStarter,
  loadBoardIndex,
  loadPipelines,
  nextBoardId,
  saveBoardDoc,
  starterById,
  type BoardMeta,
  type BoardStorageLike,
  type SavedPipeline,
} from '../../lib/studio/board';

function browserStorage(): BoardStorageLike | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export default function StudioBoardHomePage() {
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [pipelines, setPipelines] = useState<SavedPipeline[]>([]);
  const [state, setState] = useState<BoardHomeState>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const storage = browserStorage();
    if (!storage) {
      setState('error');
      setError('This device has no local storage available, so boards cannot be kept here.');
      return;
    }
    try {
      setBoards(loadBoardIndex(storage));
      setPipelines(loadPipelines(storage));
      setState('ready');
      setError(null);
    } catch {
      setState('error');
      setError('Your boards could not be loaded from this device.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createBoard = useCallback((): string => {
    const storage = browserStorage();
    const id = nextBoardId(boards);
    if (storage) {
      saveBoardDoc(storage, emptyBoardDoc(id), new Date().toISOString());
      setBoards(loadBoardIndex(storage));
    }
    return id;
  }, [boards]);

  const instantiate = useCallback(
    (starterId: string): string => {
      const storage = browserStorage();
      const id = nextBoardId(boards);
      const starter = starterById(starterId);
      if (storage && starter) {
        saveBoardDoc(storage, instantiateStarter(id, starter), new Date().toISOString());
        setBoards(loadBoardIndex(storage));
      }
      return id;
    },
    [boards],
  );

  const removeBoard = useCallback(
    (boardId: string) => {
      const storage = browserStorage();
      if (!storage) return;
      deleteBoard(storage, boardId);
      setBoards(loadBoardIndex(storage));
    },
    [],
  );

  return (
    <StudioShell active="board">
      <BoardHome
        boards={boards}
        boardsState={state}
        boardsError={error}
        onRetryBoards={load}
        onCreateBoard={createBoard}
        onInstantiateStarter={instantiate}
        onDeleteBoard={removeBoard}
        pipelines={pipelines}
      />
    </StudioShell>
  );
}
