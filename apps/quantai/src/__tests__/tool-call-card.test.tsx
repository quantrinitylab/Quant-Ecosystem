import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ToolCall } from '../types/tool-calls';
import { TOOL_ICONS } from '../types/tool-calls';

// Mock framer-motion for server rendering
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    span: ({ children, ...props }: any) => React.createElement('span', props, children),
    svg: ({ children, ...props }: any) => React.createElement('svg', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

const { ToolCallCard } = await import('../components/ToolCallCard');
const { AgenticMessage } = await import('../components/AgenticMessage');
const { VoiceToggle } = await import('../components/VoiceToggle');

describe('ToolCallCard', () => {
  const baseToolCall: ToolCall = {
    id: 'tc-1',
    name: 'web_search',
    status: 'completed',
    arguments: { query: 'test query' },
    result: { url: 'https://example.com' },
    duration: 1200,
  };

  it('renders completed tool call', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolCallCard, { toolCall: baseToolCall }),
    );
    expect(html).toContain('web_search');
    expect(html).toContain('Done');
    expect(html).toContain('1.2s');
  });

  it('renders running tool call', () => {
    const running: ToolCall = {
      ...baseToolCall,
      status: 'running',
      result: undefined,
      duration: undefined,
    };
    const html = renderToStaticMarkup(React.createElement(ToolCallCard, { toolCall: running }));
    expect(html).toContain('Running');
  });

  it('renders failed tool call', () => {
    const failed: ToolCall = { ...baseToolCall, status: 'failed', error: 'Timeout' };
    const html = renderToStaticMarkup(React.createElement(ToolCallCard, { toolCall: failed }));
    expect(html).toContain('Failed');
  });

  it('renders pending tool call', () => {
    const pending: ToolCall = { ...baseToolCall, status: 'pending', result: undefined };
    const html = renderToStaticMarkup(React.createElement(ToolCallCard, { toolCall: pending }));
    expect(html).toContain('Pending');
  });

  it('uses correct icon from TOOL_ICONS map', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolCallCard, { toolCall: baseToolCall }),
    );
    expect(html).toContain(TOOL_ICONS.web_search);
  });

  it('uses default icon for unknown tool', () => {
    const custom: ToolCall = { ...baseToolCall, name: 'unknown_tool' };
    const html = renderToStaticMarkup(React.createElement(ToolCallCard, { toolCall: custom }));
    expect(html).toContain(TOOL_ICONS.default);
  });
});

describe('AgenticMessage', () => {
  it('renders content with tool calls', () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc-1', name: 'web_search', status: 'completed', arguments: { q: 'test' } },
      { id: 'tc-2', name: 'code_execute', status: 'running', arguments: { code: 'x=1' } },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AgenticMessage, {
        content: 'Here are the results',
        toolCalls,
      }),
    );
    expect(html).toContain('Here are the results');
    expect(html).toContain('web_search');
    expect(html).toContain('code_execute');
  });

  it('renders reasoning section when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgenticMessage, {
        content: 'Final answer',
        toolCalls: [],
        reasoning: 'Let me think about this...',
      }),
    );
    expect(html).toContain('Thinking...');
  });

  it('renders without reasoning when not provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgenticMessage, {
        content: 'Simple response',
        toolCalls: [],
      }),
    );
    expect(html).toContain('Simple response');
    expect(html).not.toContain('Thinking');
  });
});

describe('VoiceToggle', () => {
  it('renders inactive state', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: false,
        onToggle: () => {},
      }),
    );
    expect(html).toContain('Start recording');
    expect(html).not.toContain('Listening');
  });

  it('renders active state with listening label', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: true,
        onToggle: () => {},
      }),
    );
    expect(html).toContain('Stop recording');
    expect(html).toContain('Listening...');
  });

  it('renders processing state', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceToggle, {
        isActive: true,
        onToggle: () => {},
        isProcessing: true,
      }),
    );
    expect(html).toContain('Processing...');
  });
});
