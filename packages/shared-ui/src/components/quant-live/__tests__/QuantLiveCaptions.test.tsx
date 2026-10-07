// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuantLiveCaptions } from '../QuantLiveCaptions';
import type { CaptionEntry } from '../types';

const makeCaption = (overrides: Partial<CaptionEntry> = {}): CaptionEntry => ({
  id: '1',
  speaker: 'user',
  text: 'Hello',
  timestamp: Date.now(),
  isFinal: true,
  ...overrides,
});

describe('QuantLiveCaptions', () => {
  it('renders captions in the log', () => {
    const captions = [
      makeCaption({ id: '1', text: 'Hi there' }),
      makeCaption({ id: '2', speaker: 'assistant', text: 'Hello!' }),
    ];
    render(<QuantLiveCaptions captions={captions} />);
    expect(screen.getByText('Hi there')).toBeDefined();
    expect(screen.getByText('Hello!')).toBeDefined();
  });

  it('user messages have blue styling class', () => {
    const captions = [makeCaption({ id: '1', speaker: 'user', text: 'User msg' })];
    render(<QuantLiveCaptions captions={captions} />);
    const el = screen.getByText('User msg');
    expect(el.className).toContain('bg-blue-100');
  });

  it('assistant messages have gray styling class', () => {
    const captions = [makeCaption({ id: '1', speaker: 'assistant', text: 'Bot msg' })];
    render(<QuantLiveCaptions captions={captions} />);
    const el = screen.getByText('Bot msg');
    expect(el.className).toContain('bg-gray-100');
  });

  it('respects maxVisible prop and only shows last N', () => {
    const captions = Array.from({ length: 10 }, (_, i) =>
      makeCaption({ id: String(i), text: `msg-${i}` }),
    );
    render(<QuantLiveCaptions captions={captions} maxVisible={3} />);
    expect(screen.queryByText('msg-6')).toBeNull();
    expect(screen.getByText('msg-7')).toBeDefined();
    expect(screen.getByText('msg-8')).toBeDefined();
    expect(screen.getByText('msg-9')).toBeDefined();
  });

  it('empty captions renders empty log', () => {
    render(<QuantLiveCaptions captions={[]} />);
    const log = screen.getByRole('log');
    expect(log.children.length).toBe(0);
  });

  it('isFinal=false entries have italic class', () => {
    const captions = [makeCaption({ id: '1', text: 'Partial', isFinal: false })];
    render(<QuantLiveCaptions captions={captions} />);
    const el = screen.getByText('Partial');
    expect(el.className).toContain('italic');
  });
});
