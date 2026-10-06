import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoalsSections } from '../components/goals/GoalsPage';

const noop = () => {};

const tracking = [
  { id: 'g1', title: 'Run 5k', description: 'Three times a week', category: 'health', status: 'tracking' as const, completedAt: null },
  { id: 'g2', title: 'Save money', description: '', category: 'finance', status: 'tracking' as const, completedAt: null },
];
const done = [
  { id: 'g3', title: 'Read 10 books', description: '', category: 'custom', status: 'done' as const, completedAt: new Date().toISOString() },
];
const proposals = [
  { id: 'p1', title: 'Meditate daily', description: 'Start with 5 minutes', category: 'health', source: 'task_1' },
];

function render(props: Partial<Parameters<typeof GoalsSections>[0]> = {}) {
  return renderToStaticMarkup(
    React.createElement(GoalsSections, {
      tracking,
      done,
      proposals,
      togglingId: null,
      onToggle: noop,
      onDelete: noop,
      onAcceptProposal: noop,
      onDismissProposal: noop,
      ...props,
    }),
  );
}

describe('GoalsSections (Muse S7 parity)', () => {
  it('renders the Tracking section with a green dot and checkbox rows with title + description', () => {
    const html = render();
    expect(html).toContain('Tracking');
    expect(html).toContain('bg-green-400');
    expect(html).toContain('Run 5k');
    expect(html).toContain('Three times a week');
    expect(html).toContain('❤️ Health');
    expect(html).toContain('💲 Finance');
    expect(html).toContain('Complete goal: Run 5k');
  });

  it('renders the Goals section with a blue dot for completed goals', () => {
    const html = render();
    expect(html).toContain('bg-blue-400');
    expect(html).toContain('Read 10 books');
    expect(html).toContain('Reopen goal: Read 10 books');
  });

  it('renders Suggested by Quanty proposals with Add and Dismiss actions', () => {
    const html = render();
    expect(html).toContain('Suggested by Quanty');
    expect(html).toContain('Meditate daily');
    expect(html).toContain('Start with 5 minutes');
    expect(html).toContain('Add');
    expect(html).toContain('Dismiss');
  });

  it('shows an honest empty state when no goals are tracked', () => {
    const html = render({ tracking: [], done: [], proposals: [] });
    expect(html).toContain('No goals being tracked yet.');
    expect(html).not.toContain('Run 5k');
    expect(html).not.toContain('Suggested by Quanty');
  });

  it('hides the completed Goals section when there are no completed goals', () => {
    const html = render({ done: [], proposals: [] });
    expect(html).toContain('Tracking');
    expect(html).not.toContain('bg-blue-400');
  });
});
