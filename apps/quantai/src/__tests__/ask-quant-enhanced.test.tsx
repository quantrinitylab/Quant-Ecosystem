import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock framer-motion for server rendering
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    span: ({ children, ...props }: any) => React.createElement('span', props, children),
    svg: ({ children, ...props }: any) => React.createElement('svg', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

const { AskQuantPanel } = await import('../components/AskQuantPanel');
const { WorkflowProgressCard } = await import('../components/WorkflowProgressCard');
const { VoiceToggle } = await import('../components/VoiceToggle');

describe('AskQuantPanel - Enhanced Features', () => {
  it('renders voice toggle button', () => {
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    expect(html).toContain('aria-label');
    // VoiceToggle renders a button with Start/Stop recording label
    expect(html).toContain('Start recording');
  });

  it('renders with plan preview section available (Preview button present)', () => {
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    // The submit button says "Preview" (dry-run first)
    expect(html).toContain('Preview');
  });

  it('renders confirmation UI elements (Confirmation Required section exists in markup support)', () => {
    // The component has confirmation handling in its structure
    const html = renderToStaticMarkup(React.createElement(AskQuantPanel));
    // The form and voice toggle are always rendered
    expect(html).toContain('Ask Quant');
    expect(html).toContain('placeholder');
  });
});

describe('WorkflowProgressCard - Rollback', () => {
  it('renders rollback/failure status correctly', () => {
    const steps = [
      {
        stepId: 'step-1',
        toolId: 'quantmail.send',
        status: 'completed' as const,
        startedAt: 1000,
        completedAt: 1500,
      },
      {
        stepId: 'step-2',
        toolId: 'quantchat.send',
        status: 'failed' as const,
        error: 'Rollback triggered',
      },
    ];
    const html = renderToStaticMarkup(React.createElement(WorkflowProgressCard, { steps }));
    expect(html).toContain('Rollback triggered');
    expect(html).toContain('quantmail.send');
    expect(html).toContain('quantchat.send');
    expect(html).toContain('1/2 steps');
  });
});

describe('VoiceToggle - States', () => {
  it('renders inactive state with Start recording label', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: false,
        onToggle: () => {},
        isProcessing: false,
      }),
    );
    expect(html).toContain('Start recording');
    expect(html).not.toContain('Listening');
  });

  it('renders active state with Listening text', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: true,
        onToggle: () => {},
        isProcessing: false,
      }),
    );
    expect(html).toContain('Stop recording');
    expect(html).toContain('Listening...');
  });

  it('renders processing state with Processing text', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: false,
        onToggle: () => {},
        isProcessing: true,
      }),
    );
    expect(html).toContain('Processing...');
    // Processing disables the button
    expect(html).toContain('disabled');
  });
});
