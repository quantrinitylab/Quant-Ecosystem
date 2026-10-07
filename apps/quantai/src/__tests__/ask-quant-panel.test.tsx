import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock framer-motion for server rendering
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    span: ({ children, ...props }: any) => React.createElement('span', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

const { AskQuantPanel } = await import('../components/AskQuantPanel');
const { WorkflowProgressCard } = await import('../components/WorkflowProgressCard');

describe('AskQuantPanel', () => {
  it('renders with input field and submit button', () => {
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    expect(html).toContain('Ask Quant');
    expect(html).toContain('placeholder');
    expect(html).toContain('Ask');
  });

  it('renders input with correct aria-label', () => {
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    expect(html).toContain('aria-label="Ask Quant"');
  });

  it('renders submit button that is disabled when input is empty', () => {
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    expect(html).toContain('disabled');
  });

  it('applies custom className', () => {
    const html = renderToStaticMarkup(
      React.createElement(AskQuantPanel, { className: 'test-class' }),
    );
    expect(html).toContain('test-class');
  });
});

describe('WorkflowProgressCard', () => {
  it('renders with steps showing pending status', () => {
    const steps = [
      { stepId: 'step-1', toolId: 'quantmail.send-email', status: 'pending' as const },
      { stepId: 'step-2', toolId: 'quantcalendar.create-event', status: 'pending' as const },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('quantmail.send-email');
    expect(html).toContain('quantcalendar.create-event');
    expect(html).toContain('0/2 steps');
  });

  it('renders completed steps count correctly', () => {
    const steps = [
      {
        stepId: 'step-1',
        toolId: 'quantmail.send-email',
        status: 'completed' as const,
        startedAt: 1000,
        completedAt: 1500,
      },
      {
        stepId: 'step-2',
        toolId: 'quantcalendar.create-event',
        status: 'running' as const,
        startedAt: 1500,
      },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('1/2 steps');
  });

  it('renders plan description when provided', () => {
    const steps = [{ stepId: 'step-1', toolId: 'test.tool', status: 'pending' as const }];
    const html = renderToStaticMarkup(
      React.createElement(WorkflowProgressCard, {
        steps,
        planDescription: 'Send email and create event',
      }),
    );
    expect(html).toContain('Send email and create event');
  });

  it('shows success message when all steps completed', () => {
    const steps = [
      {
        stepId: 'step-1',
        toolId: 'test.tool',
        status: 'completed' as const,
        startedAt: 1000,
        completedAt: 1200,
      },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('All steps completed successfully');
  });

  it('renders error text for failed steps', () => {
    const steps = [
      {
        stepId: 'step-1',
        toolId: 'test.tool',
        status: 'failed' as const,
        error: 'Network timeout',
      },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('Network timeout');
  });

  it('renders elapsed time for steps', () => {
    const steps = [
      {
        stepId: 'step-1',
        toolId: 'test.tool',
        status: 'completed' as const,
        startedAt: 1000,
        completedAt: 2500,
      },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('1.5s');
  });

  it('applies custom className', () => {
    const steps = [{ stepId: 'step-1', toolId: 'test.tool', status: 'pending' as const }];
    const html = renderToStaticMarkup(
      React.createElement(WorkflowProgressCard, { steps, className: 'custom-cls' }),
    );
    expect(html).toContain('custom-cls');
  });
});
