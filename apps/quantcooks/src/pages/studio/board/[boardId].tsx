// ============================================================================
// QuantCooks Studio — Canvas Board screen page (route:
// /studio/board/[boardId], spec §6.2, checklist #48)
//
// Thin wiring: the page resolves the board from the on-device mirror,
// wires the caller's real assets (useAssets, P0-3) for node binding, and
// persists every document change back to the mirror through board.ts.
// A board id with no document on this device renders its honest
// not-found state — boards never sync, so a link from another device
// lands here and says so.
//
// Persistence note (board.ts has the full reasoning): the board
// document does NOT ride the P0-5 project-state seam — that endpoint
// stores exactly the timeline editor's document — and projects accept
// name/type only, so the mirror is the board's only honest home today.
// Named follow-up: a server-side board document.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../../components/studio/StudioShell';
import { BoardScreen, type BoardAssetsState } from '../../../components/studio/BoardScreen';
import { useAssets } from '../../../hooks/useAssets';
import {
  loadBoardDoc,
  nextPipelineId,
  loadPipelines,
  pipelineFromBoard,
  saveBoardDoc,
  savePipeline,
  type BoardDoc,
  type BoardStorageLike,
} from '../../../lib/studio/board';

function browserStorage(): BoardStorageLike | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

type DocState = 'loading' | 'ready' | 'missing';

export default function StudioBoardPage() {
  const router = useRouter();
  const boardId = typeof router.query.boardId === 'string' ? router.query.boardId : null;

  const [doc, setDoc] = useState<BoardDoc | null>(null);
  const [docState, setDocState] = useState<DocState>('loading');

  useEffect(() => {
    if (!boardId) return;
    const storage = browserStorage();
    if (!storage) {
      setDocState('missing');
      return;
    }
    const loaded = loadBoardDoc(storage, boardId);
    if (loaded) {
      setDoc(loaded);
      setDocState('ready');
    } else {
      setDocState('missing');
    }
  }, [boardId]);

  const assetsQuery = useAssets();
  const assetsState: BoardAssetsState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const handleSave = useCallback((next: BoardDoc) => {
    const storage = browserStorage();
    if (!storage) return;
    saveBoardDoc(storage, next, new Date().toISOString());
  }, []);

  const handleSavePipeline = useCallback((board: BoardDoc) => {
    const storage = browserStorage();
    if (!storage) return;
    const existing = loadPipelines(storage);
    savePipeline(storage, pipelineFromBoard(board, nextPipelineId(existing), new Date().toISOString()));
  }, []);

  return (
    <StudioShell active="board">
      {docState === 'loading' && (
        <div className="studio-board-skeletons" data-testid="board-page-loading" aria-label="Loading the board">
          <span className="studio-skeleton-tile" />
          <span className="studio-skeleton-tile" />
        </div>
      )}
      {docState === 'missing' && (
        <div className="studio-board-missing" data-testid="board-page-missing" role="alert">
          <h1>Board not on this device</h1>
          <p>
            Boards are drafts kept on the device that made them — they do not sync yet, so this board
            id has no document here. It may live on another device, or it was deleted.
          </p>
          <a href="/studio/board">Back to your boards</a>
        </div>
      )}
      {docState === 'ready' && doc && (
        <BoardScreen
          initialDoc={doc}
          assets={assetsQuery.data ?? []}
          assetsState={assetsState}
          assetsError={assetsQuery.error instanceof Error ? assetsQuery.error.message : null}
          onRetryAssets={() => {
            void assetsQuery.refetch();
          }}
          onSave={handleSave}
          onSavePipeline={handleSavePipeline}
          jobs={[]}
        />
      )}
    </StudioShell>
  );
}
