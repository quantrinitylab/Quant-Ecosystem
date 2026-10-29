// ============================================================================
// QuantCooks Studio — Canvas Board slide-over panels (spec §6.4)
//
// Three panels, three different honesty levels, each stated on its face:
//  - "Ask Quanty" (#52): the board's face of quantcooks.plan_project.
//    The planner is fail-closed (PLANNER_NOT_CONFIGURED), so an ask is
//    preserved verbatim and lands on the not-configured state — the
//    outcome type carries no nodes, so this panel can never pretend
//    Quanty built a graph.
//  - Team Chat (#50): chat rides the project's collaboration surface
//    (quantcooks.add_comment / list_collaborators). A board is not a
//    project yet, so there is nothing honest to attach messages to —
//    the panel renders its not-connected state rather than a fake
//    message list. The in-panel call is not built at all.
//  - Share (#51): the board's own link is real (it is this board's
//    route) and Copy Link copies it. Inviting people rides
//    quantcooks.invite_collaborator, which needs a project — so invite
//    is disabled with its reason, and access stays "Only you".
// ============================================================================

import React, { useState } from 'react';
import {
  BOARD_ASSISTANT_ACTIONS,
  BOARD_COLLABORATORS_TOOL,
  BOARD_COMMENT_TOOL,
  BOARD_INVITE_TOOL,
  BOARD_PLAN_TOOL,
  attemptBoardPlan,
  type AssistantOutcome,
} from '../../lib/studio/board';

// ---------------------------------------------------------------------------
// Ask Quanty — the in-board assistant (#52)
// ---------------------------------------------------------------------------

export interface BoardAssistantProps {
  initialAsk?: string;
  initialOutcome?: AssistantOutcome | null;
}

export const BoardAssistant: React.FC<BoardAssistantProps> = ({
  initialAsk = '',
  initialOutcome = null,
}) => {
  const [ask, setAsk] = useState(initialAsk);
  const [outcome, setOutcome] = useState<AssistantOutcome | null>(initialOutcome);

  const submit = (text: string) => {
    setOutcome(attemptBoardPlan(text));
  };

  return (
    <div className="studio-board-assistant" data-testid="board-assistant" aria-label="Ask Quanty">
      <h3>Ask Quanty</h3>
      <p>
        Describe a pipeline and Quanty drafts the nodes — every generative step is quoted before it
        runs. The planner behind this panel is {BOARD_PLAN_TOOL}.
      </p>

      <ul className="studio-board-assistant-actions">
        {BOARD_ASSISTANT_ACTIONS.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              data-testid={`board-assistant-action-${action.id}`}
              onClick={() => {
                setAsk(action.label);
                submit(action.label);
              }}
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>

      <label>
        <span className="sr-only">Describe the pipeline you want</span>
        <textarea
          data-testid="board-assistant-input"
          placeholder="Choose a quick action or start with a prompt…"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
        />
      </label>
      <button type="button" data-testid="board-assistant-submit" onClick={() => submit(ask)}>
        Plan it
      </button>

      {outcome?.status === 'invalid' && (
        <p className="studio-board-assistant-invalid" data-testid="board-assistant-invalid" role="alert">
          {outcome.message}
        </p>
      )}
      {outcome?.status === 'not-configured' && (
        <div className="studio-board-assistant-outcome" data-testid="board-assistant-outcome" role="note">
          <p>{outcome.message}</p>
          <blockquote data-testid="board-assistant-preserved-ask">{outcome.ask}</blockquote>
          <p className="studio-board-assistant-tool">Planner: {outcome.tool} · NOT_CONFIGURED</p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Team Chat (#50) — honest not-connected state
// ---------------------------------------------------------------------------

export const BoardTeamChat: React.FC<{ boardTitle: string }> = ({ boardTitle }) => (
  <div className="studio-board-teamchat" data-testid="board-teamchat" aria-label="Team chat">
    <h3>Team Chat</h3>
    <p className="studio-board-teamchat-board">{boardTitle}</p>
    <div className="studio-board-teamchat-off" data-testid="board-teamchat-not-connected" role="note">
      <p>
        Chat is not connected for boards yet. Team messages ride a project&rsquo;s collaboration surface
        ({BOARD_COMMENT_TOOL} · {BOARD_COLLABORATORS_TOOL}), and a board is not a project in this build
        — so there is no honest place to put messages, and this panel will not invent a conversation.
        When boards become projects, the chat — and its in-panel call — land here.
      </p>
    </div>
    <label>
      <span className="sr-only">Message the team</span>
      <input type="text" placeholder="Message…" disabled aria-disabled="true" />
    </label>
    <button type="button" disabled aria-disabled="true">
      Send
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Share dialog (#51) — real link, project-gated invites
// ---------------------------------------------------------------------------

export interface BoardShareProps {
  boardId: string;
  boardTitle: string;
  /** Injectable for tests; defaults to the real clipboard. */
  copyText?: (text: string) => void;
}

export const BoardShare: React.FC<BoardShareProps> = ({ boardId, boardTitle, copyText }) => {
  const [copied, setCopied] = useState(false);
  const link = `/studio/board/${boardId}`;

  const handleCopy = () => {
    if (copyText) {
      copyText(link);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(link);
    }
    setCopied(true);
  };

  return (
    <div className="studio-board-share" data-testid="board-share" aria-label={`Share ${boardTitle}`}>
      <h3>Share</h3>
      <p className="studio-board-share-owner">
        Owner: <strong>You</strong> — this board lives on your device.
      </p>

      <div className="studio-board-share-access">
        <div className="studio-board-access-card" data-testid="board-access-private" aria-current="true">
          <strong>Private</strong>
          <span>Only you — the board stays on this device.</span>
        </div>
        <div className="studio-board-access-card" data-testid="board-access-link">
          <strong>Anyone with the link</strong>
          <span>Not available while the board has no server home — a link would open nothing for anyone else.</span>
        </div>
      </div>

      <label>
        <span className="sr-only">Board link</span>
        <input type="text" readOnly value={link} data-testid="board-share-link" />
      </label>
      <button type="button" data-testid="board-share-copy" onClick={handleCopy}>
        Copy Link
      </button>
      {copied && (
        <span className="studio-board-share-copied" data-testid="board-share-copied" role="status">
          Link copied
        </span>
      )}

      <div className="studio-board-share-invite">
        <h4>Invite by email</h4>
        <p data-testid="board-invite-off" role="note">
          Inviting rides {BOARD_INVITE_TOOL}, which adds members to a project. Boards are not projects
          yet, so inviting is off rather than pretend — no email is sent and no member is added.
        </p>
        <label>
          <span className="sr-only">Email to invite</span>
          <input type="email" placeholder="name@example.com" disabled aria-disabled="true" />
        </label>
        <select disabled aria-disabled="true" aria-label="Role">
          <option>Viewer</option>
          <option>Collaborator</option>
        </select>
        <button type="button" disabled aria-disabled="true">
          Invite
        </button>
      </div>

      <div className="studio-board-share-members">
        <h4>Members</h4>
        <ul>
          <li data-testid="board-member-owner">You · Owner</li>
        </ul>
      </div>
    </div>
  );
};
