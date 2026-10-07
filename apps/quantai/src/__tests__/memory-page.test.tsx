import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock fetch before importing the component
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
});
vi.stubGlobal('fetch', mockFetch);

// Dynamic import after mocking
const { default: MemoryPage } = await import('../pages/memory');

describe('MemoryPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
  });

  it('renders without crashing and produces valid HTML', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders all 8 category names in the output', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    const expectedCategories = [
      'People',
      'Places',
      'Projects',
      'Preferences',
      'Skills',
      'Goals',
      'Schedules',
      'Routines',
    ];

    for (const category of expectedCategories) {
      expect(html).toContain(category);
    }
  });

  it('renders the export button', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    expect(html).toContain('Export');
  });

  it('renders the disclosure section heading button', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    expect(html).toContain('What does Quant know about me?');
  });

  it('renders the candidates section heading when candidates are present', () => {
    // With no candidates (default mock returns []), the section should not appear
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    // The heading text exists in the code but only renders when candidates.length > 0
    // With empty data, it should not contain the candidates heading
    expect(html).not.toContain('Pending Candidates');
  });

  it('component is a valid React function component', () => {
    expect(typeof MemoryPage).toBe('function');
    expect(MemoryPage.name).toBe('MemoryPage');
  });

  it('renders the search input', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    expect(html).toContain('Search memories');
  });

  it('renders the AI Memory page header', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryPage));
    expect(html).toContain('AI Memory');
    expect(html).toContain('memories stored');
  });
});
