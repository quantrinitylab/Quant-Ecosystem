// ============================================================================
// QuantCooks Studio — Canvas Board home (spec §6.1, checklist #47)
//
// Hero → My Boards grid → Explore board templates → My Pipelines.
//
// What is REAL on this screen today:
//  - My Boards: the caller's boards from the on-device draft mirror
//    (create / open / delete all work against the mirror), and the
//    template cards, which instantiate into real editable boards.
//  - Saved pipelines: boards the cook saved as reusable — stored in
//    quantcooks.run_pipeline's own inline definition shape.
// What is NOT real, and says so on the surface:
//  - Server sync. Boards are not projects yet — there is no server
//    field for a board document (see board.ts) — so boards live on
//    this device and the screen labels them that way. The checklist's
//    list_projects twin names the surface this becomes when the
//    server-side board document lands.
// ============================================================================

import React from 'react';
import {
  BOARD_RUN_TOOL,
  BOARD_STARTERS,
  type BoardMeta,
  type SavedPipeline,
} from '../../lib/studio/board';

export type BoardHomeState = 'loading' | 'ready' | 'error';

export interface BoardHomeProps {
  boards?: BoardMeta[];
  boardsState: BoardHomeState;
  boardsError?: string | null;
  onRetryBoards?: () => void;
  /** Create a fresh empty board in the mirror; returns its id. */
  onCreateBoard?: () => string;
  /** Instantiate a starter template into a new board; returns its id. */
  onInstantiateStarter?: (starterId: string) => string;
  /** Delete a board from the mirror. */
  onDeleteBoard?: (boardId: string) => void;
  pipelines?: SavedPipeline[];
}

export const BoardHome: React.FC<BoardHomeProps> = ({
  boards = [],
  boardsState,
  boardsError,
  onRetryBoards,
  onCreateBoard,
  onInstantiateStarter,
  onDeleteBoard,
  pipelines = [],
}) => {
  const isEmpty = boardsState === 'ready' && boards.length === 0;

  return (
    <section className="studio-board-home" data-testid="board-home">
      <header className="studio-board-hero">
        <h1><span className="studio-title-accent">Canvas</span> Board</h1>
        <p>
          Make images, videos and ideas in one place: wire a dish photo into a styled still, the still
          into a clip, the clip into an ad — a pipeline you can re-run on the next special. Boards are
          saved on this device for now; running a board prices every step first through {BOARD_RUN_TOOL}{' '}
          and charges nothing until a provider is connected.
        </p>
        {onCreateBoard && (
          <a
            className="studio-board-create"
            data-testid="board-create"
            href="/studio/board"
            onClick={(e) => {
              e.preventDefault();
              const id = onCreateBoard();
              window.location.href = `/studio/board/${id}`;
            }}
          >
            Create Board
          </a>
        )}
      </header>

      <div className="studio-board-mine">
        <h2>My Boards</h2>
        <p className="studio-board-device-note" data-testid="board-device-note" role="note">
          Draft on this device — boards do not sync yet, because a board document has no server home in
          this build. Nothing here is shared or published.
        </p>

        {boardsState === 'loading' && (
          <div className="studio-board-skeletons" data-testid="board-home-loading" aria-label="Loading your boards">
            <span className="studio-skeleton-tile" />
            <span className="studio-skeleton-tile" />
            <span className="studio-skeleton-tile" />
          </div>
        )}

        {boardsState === 'error' && (
          <div className="studio-board-error" data-testid="board-home-error" role="alert">
            <p>{boardsError ?? 'Your boards could not be loaded from this device.'}</p>
            <button type="button" onClick={() => onRetryBoards?.()}>
              Retry
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="studio-board-empty" data-testid="board-home-empty">
            <h3>No boards yet</h3>
            <p>
              Start blank, or take a template below — a pipeline is just nodes wired in the order the
              work happens.
            </p>
          </div>
        )}

        {boardsState === 'ready' && boards.length > 0 && (
          <ul className="studio-board-grid">
            {boards.map((board) => (
              <li key={board.id} className="studio-board-card" data-testid={`board-card-${board.id}`}>
                <a href={`/studio/board/${board.id}`}>{board.title}</a>
                {board.updatedAt && <span className="studio-board-updated">Edited {board.updatedAt}</span>}
                {onDeleteBoard && (
                  <button type="button" onClick={() => onDeleteBoard(board.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="studio-board-templates">
        <h2>Explore board templates</h2>
        <ul className="studio-board-template-grid">
          {BOARD_STARTERS.map((starter) => (
            <li key={starter.id} className="studio-board-template" data-testid={`board-template-${starter.id}`}>
              <strong>{starter.name}</strong>
              <span>{starter.description}</span>
              {onInstantiateStarter && (
                <a
                  href="/studio/board"
                  onClick={(e) => {
                    e.preventDefault();
                    const id = onInstantiateStarter(starter.id);
                    window.location.href = `/studio/board/${id}`;
                  }}
                >
                  Use this template
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="studio-board-pipelines">
        <h2>My Pipelines</h2>
        {pipelines.length === 0 ? (
          <p data-testid="board-pipelines-empty">
            No saved pipelines yet. Build a chain on a board and choose “Save as Reusable Pipeline” — it
            will live here, in the exact shape {BOARD_RUN_TOOL} runs.
          </p>
        ) : (
          <ul className="studio-board-pipeline-list">
            {pipelines.map((pipeline) => (
              <li key={pipeline.id} data-testid={`board-pipeline-${pipeline.id}`}>
                <strong>{pipeline.name}</strong>
                <span>
                  {pipeline.definition.nodes.length} nodes · {pipeline.definition.edges.length} wires
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default BoardHome;
