// @vitest-environment jsdom
// ============================================================================
// Shared UI - Agent Components Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentDock } from '../agent/AgentDock';
import { AgentCard } from '../agent/AgentCard';
import { ApprovalDialog } from '../agent/ApprovalDialog';
import { AgentTimeline } from '../agent/AgentTimeline';
import { AgentCreator } from '../agent/AgentCreator';
import { AgentMiniWidget } from '../agent/AgentMiniWidget';
import type { AgentStatus } from '../agent/AgentCard';
import type { ApprovalRequest } from '../agent/ApprovalDialog';
import type { TimelineEntry } from '../agent/AgentTimeline';

const mockAgent: AgentStatus = {
  id: 'agent-1',
  name: 'Research Bot',
  icon: '🤖',
  status: 'running',
  progress: 65,
  currentAction: 'Analyzing documents',
};

const mockPausedAgent: AgentStatus = {
  id: 'agent-2',
  name: 'Data Bot',
  icon: '📊',
  status: 'paused',
  progress: 30,
  currentAction: 'Waiting for input',
};

const mockApprovalRequest: ApprovalRequest = {
  id: 'req-1',
  agentName: 'Research Bot',
  action: 'Access external API',
  riskLevel: 'high',
  timeoutMs: 30000,
};

const mockTimelineEntries: TimelineEntry[] = [
  {
    id: 'entry-1',
    agentName: 'Research Bot',
    action: 'Created file report.md',
    timestamp: '10:30 AM',
    reversible: true,
    result: 'success',
  },
  {
    id: 'entry-2',
    agentName: 'Data Bot',
    action: 'Fetched API data',
    timestamp: '10:25 AM',
    reversible: false,
    result: 'success',
  },
  {
    id: 'entry-3',
    agentName: 'Research Bot',
    action: 'Failed to parse response',
    timestamp: '10:20 AM',
    reversible: false,
    result: 'failure',
  },
];

describe('AgentDock', () => {
  it('renders agent list when open', () => {
    render(
      <AgentDock agents={[mockAgent]} onAgentSelect={() => {}} isOpen={true} onClose={() => {}} />,
    );
    expect(screen.getByText('Research Bot')).toBeDefined();
    expect(screen.getByText('Running Agents')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(
      <AgentDock agents={[mockAgent]} onAgentSelect={() => {}} isOpen={false} onClose={() => {}} />,
    );
    expect(screen.queryByText('Research Bot')).toBeNull();
  });

  it('calls onAgentSelect on agent click', () => {
    const onAgentSelect = vi.fn();
    render(
      <AgentDock
        agents={[mockAgent]}
        onAgentSelect={onAgentSelect}
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select agent Research Bot' }));
    expect(onAgentSelect).toHaveBeenCalledWith('agent-1');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AgentDock agents={[mockAgent]} onAgentSelect={() => {}} isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(screen.getByLabelText('Close agent dock'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state with no agents', () => {
    render(<AgentDock agents={[]} onAgentSelect={() => {}} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('No agents running')).toBeDefined();
  });
});

describe('AgentCard', () => {
  it('shows agent name and status', () => {
    render(
      <AgentCard agent={mockAgent} onPause={() => {}} onStop={() => {}} onResume={() => {}} />,
    );
    expect(screen.getByText('Research Bot')).toBeDefined();
    expect(screen.getByText('running')).toBeDefined();
  });

  it('shows current action', () => {
    render(
      <AgentCard agent={mockAgent} onPause={() => {}} onStop={() => {}} onResume={() => {}} />,
    );
    expect(screen.getByText('Analyzing documents')).toBeDefined();
  });

  it('shows progress bar', () => {
    render(
      <AgentCard agent={mockAgent} onPause={() => {}} onStop={() => {}} onResume={() => {}} />,
    );
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('65');
  });

  it('calls onPause for running agent', () => {
    const onPause = vi.fn();
    render(<AgentCard agent={mockAgent} onPause={onPause} onStop={() => {}} onResume={() => {}} />);
    fireEvent.click(screen.getByLabelText('Pause Research Bot'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onStop for running agent', () => {
    const onStop = vi.fn();
    render(<AgentCard agent={mockAgent} onPause={() => {}} onStop={onStop} onResume={() => {}} />);
    fireEvent.click(screen.getByLabelText('Stop Research Bot'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('calls onResume for paused agent', () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        agent={mockPausedAgent}
        onPause={() => {}}
        onStop={() => {}}
        onResume={onResume}
      />,
    );
    fireEvent.click(screen.getByLabelText('Resume Data Bot'));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('shows stop button for paused agent', () => {
    render(
      <AgentCard
        agent={mockPausedAgent}
        onPause={() => {}}
        onStop={() => {}}
        onResume={() => {}}
      />,
    );
    expect(screen.getByLabelText('Stop Data Bot')).toBeDefined();
  });
});

describe('ApprovalDialog', () => {
  it('renders when open', () => {
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={() => {}}
        onReject={() => {}}
        open={true}
      />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Permission Request')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={() => {}}
        onReject={() => {}}
        open={false}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows agent name and action', () => {
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={() => {}}
        onReject={() => {}}
        open={true}
      />,
    );
    expect(screen.getByText('Research Bot')).toBeDefined();
    expect(screen.getByText('Access external API')).toBeDefined();
  });

  it('shows risk level badge', () => {
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={() => {}}
        onReject={() => {}}
        open={true}
      />,
    );
    expect(screen.getByText('high')).toBeDefined();
  });

  it('calls onApprove when approve button is clicked', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={onApprove}
        onReject={() => {}}
        open={true}
      />,
    );
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onReject when reject button is clicked', () => {
    const onReject = vi.fn();
    render(
      <ApprovalDialog
        request={mockApprovalRequest}
        onApprove={() => {}}
        onReject={onReject}
        open={true}
      />,
    );
    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

describe('AgentTimeline', () => {
  it('renders timeline entries', () => {
    render(<AgentTimeline entries={mockTimelineEntries} onUndo={() => {}} />);
    expect(screen.getByText('Created file report.md')).toBeDefined();
    expect(screen.getByText('Fetched API data')).toBeDefined();
    expect(screen.getByText('Failed to parse response')).toBeDefined();
  });

  it('shows agent names and timestamps', () => {
    render(<AgentTimeline entries={mockTimelineEntries} onUndo={() => {}} />);
    expect(screen.getAllByText('Research Bot').length).toBe(2);
    expect(screen.getByText('10:30 AM')).toBeDefined();
  });

  it('shows undo button only for reversible entries', () => {
    render(<AgentTimeline entries={mockTimelineEntries} onUndo={() => {}} />);
    const undoButtons = screen.getAllByText('Undo');
    expect(undoButtons.length).toBe(1);
  });

  it('calls onUndo with entry id', () => {
    const onUndo = vi.fn();
    render(<AgentTimeline entries={mockTimelineEntries} onUndo={onUndo} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledWith('entry-1');
  });
});

describe('AgentCreator', () => {
  it('renders input fields', () => {
    render(<AgentCreator onSubmit={() => {}} existingAgents={[]} />);
    expect(screen.getByLabelText('Describe your agent')).toBeDefined();
    expect(screen.getByLabelText('Permission Level')).toBeDefined();
  });

  it('shows existing agents', () => {
    render(<AgentCreator onSubmit={() => {}} existingAgents={['Bot A', 'Bot B']} />);
    expect(screen.getByText('Bot A')).toBeDefined();
    expect(screen.getByText('Bot B')).toBeDefined();
  });

  it('shows preview when description is entered', () => {
    render(<AgentCreator onSubmit={() => {}} existingAgents={[]} />);
    const textarea = screen.getByLabelText('Describe your agent');
    fireEvent.change(textarea, { target: { value: 'Monitor emails' } });
    expect(screen.getByText('Preview')).toBeDefined();
    expect(screen.getAllByText('Monitor emails').length).toBeGreaterThanOrEqual(2);
  });

  it('calls onSubmit with config', () => {
    const onSubmit = vi.fn();
    render(<AgentCreator onSubmit={onSubmit} existingAgents={[]} />);
    const textarea = screen.getByLabelText('Describe your agent');
    fireEvent.change(textarea, { target: { value: 'Monitor emails' } });
    fireEvent.click(screen.getByText('Create Agent'));
    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Monitor emails',
      permissionLevel: 'SUGGEST',
    });
  });

  it('disables submit when description is empty', () => {
    render(<AgentCreator onSubmit={() => {}} existingAgents={[]} />);
    const button = screen.getByText('Create Agent');
    expect(button).toHaveProperty('disabled', true);
  });
});

describe('AgentMiniWidget', () => {
  it('shows running count', () => {
    render(<AgentMiniWidget runningCount={5} hasApprovalsPending={false} onClick={() => {}} />);
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('agents')).toBeDefined();
  });

  it('shows pending indicator when approvals pending', () => {
    render(<AgentMiniWidget runningCount={3} hasApprovalsPending={true} onClick={() => {}} />);
    expect(screen.getByLabelText('Approvals pending')).toBeDefined();
  });

  it('does not show pending indicator when no approvals', () => {
    render(<AgentMiniWidget runningCount={3} hasApprovalsPending={false} onClick={() => {}} />);
    expect(screen.queryByLabelText('Approvals pending')).toBeNull();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<AgentMiniWidget runningCount={2} hasApprovalsPending={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
