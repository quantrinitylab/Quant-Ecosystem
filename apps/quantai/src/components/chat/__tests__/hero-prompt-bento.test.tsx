import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroPromptBento } from '../HeroPromptBento';

describe('HeroPromptBento', () => {
  it('renders the hero heading "What can I help with?"', () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroPromptBento, {
        onSelectPrompt: vi.fn(),
        onStartVoice: vi.fn(),
        onOpenCanvas: vi.fn(),
        onAttachFile: vi.fn(),
      }),
    );

    expect(html).toContain('What can I help with?');
  });

  it('renders all 4 bento starter cards with badges and titles', () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroPromptBento, {
        onSelectPrompt: vi.fn(),
        onStartVoice: vi.fn(),
        onOpenCanvas: vi.fn(),
        onAttachFile: vi.fn(),
      }),
    );

    // Card 1: Image Generation
    expect(html).toContain('Generate Visual Concepts');
    expect(html).toContain('Image Generation');

    // Card 2: Work Canvas
    expect(html).toContain('Synthesize Documents &amp; Code');
    expect(html).toContain('Work Canvas');

    // Card 3: Voice Mode
    expect(html).toContain('Start Real-Time Voice Mode');
    expect(html).toContain('Voice Mode');

    // Card 4: Document OCR
    expect(html).toContain('Vision Analysis &amp; Document OCR');
    expect(html).toContain('Document OCR');
  });

  it('renders accurate subtext for prompt cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroPromptBento, {
        onSelectPrompt: vi.fn(),
        onStartVoice: vi.fn(),
        onOpenCanvas: vi.fn(),
        onAttachFile: vi.fn(),
      }),
    );

    expect(html).toContain('Craft hyper-detailed prompts to describe any visual');
    expect(html).toContain('Draft technical specs, markdown docs &amp; code in split Work Canvas');
    expect(html).toContain('Fluid real-time conversational voice session');
    expect(html).toContain('Extract tables, structured data &amp; scene captions from uploaded documents');
  });

  it('triggers correct callbacks when bento cards are clicked or activated with Enter', () => {
    const onSelectPrompt = vi.fn();
    const onStartVoice = vi.fn();
    const onOpenCanvas = vi.fn();
    const onAttachFile = vi.fn();

    const element = HeroPromptBento({
      onSelectPrompt,
      onStartVoice,
      onOpenCanvas,
      onAttachFile,
    });

    // Inspect the JSX tree:
    // element -> div -> motion.div -> [h2, div.grid] -> motion.div cards
    const motionContainer = element.props.children;
    const gridContainer = motionContainer.props.children[1];
    const cards = gridContainer.props.children;

    expect(cards).toHaveLength(4);

    // Card 1: Image Generation (Visuals)
    cards[0].props.onClick();
    expect(onSelectPrompt).toHaveBeenCalledWith(
      expect.stringContaining(
        'photorealistic cinematic render of a futuristic quantum supercomputer',
      ),
    );

    // Card 2: Work Canvas (Docs & Code)
    cards[1].props.onClick();
    expect(onSelectPrompt).toHaveBeenCalledWith(
      expect.stringContaining('Design an architecture document'),
    );
    expect(onOpenCanvas).toHaveBeenCalledTimes(1);

    // Card 3: Voice Mode (Real-Time Voice Mode)
    cards[2].props.onClick();
    expect(onStartVoice).toHaveBeenCalledTimes(1);

    // Card 4: Document OCR (Vision Analysis)
    cards[3].props.onClick();
    expect(onSelectPrompt).toHaveBeenCalledWith(
      expect.stringContaining('Extract all key entities, dates, and tables'),
    );
    expect(onAttachFile).toHaveBeenCalledTimes(1);

    // Test onKeyDown with Enter triggers card onClick
    onStartVoice.mockClear();
    cards[2].props.onKeyDown({ key: 'Enter' });
    expect(onStartVoice).toHaveBeenCalledTimes(1);

    // Test non-Enter keys do not trigger onClick
    onStartVoice.mockClear();
    cards[2].props.onKeyDown({ key: 'Escape' });
    expect(onStartVoice).not.toHaveBeenCalled();
  });
});
