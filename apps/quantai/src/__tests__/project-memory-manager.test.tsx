// ============================================================================
// QuantAI — ProjectMemoryManager React UI Component Test Suite
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectMemoryManager, type ProjectMemory } from '../components/ProjectMemoryManager';

// Enable React 19 act environment in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ProjectMemoryManager — Component & Enterprise Context Boundary', () => {
  const sampleMemory: ProjectMemory = {
    projectId: 'proj-enterprise-1',
    workspaceId: 'ws-quant-core',
    customInstructions: 'Enforce sub-5ms latency and zero data leakage across workspaces.',
    memoryMode: 'PROJECT_ISOLATED',
    createdAt: 1727220000000,
    updatedAt: 1727220000000,
    memoryEntries: [
      {
        id: 'mem-1',
        content: 'Core architecture must use isolated FastCDC chunks.',
        category: 'architecture',
        createdAt: 1727220000000,
        isPinned: true,
      },
      {
        id: 'mem-2',
        content: 'Color palette must strictly adhere to Quant Studio tokens.',
        category: 'conventions',
        createdAt: 1727220000000,
        isPinned: false,
      },
    ],
  };

  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Static Markup & Design System Token Verification
  // ==========================================================================
  describe('Quant Studio Design System Tokens & Markup', () => {
    it('renders with QSDS color tokens (#0D1117, #161B22, #30363D, #58A6FF, #FF8C42)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      // Verify QSDS color tokens are present in styles/markup
      expect(html).toContain('#0D1117'); // Dark Background
      expect(html).toContain('#161B22'); // Panel Background
      expect(html).toContain('#30363D'); // Border
      expect(html).toContain('#58A6FF'); // Primary Blue
      expect(html).toContain('#FF8C42'); // Safety/Shield Orange
    });

    it('renders the header title and project ID', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      expect(html).toContain('Project Workspace Memory &amp; Context Isolation');
      expect(html).toContain('proj-enterprise-1');
    });

    it('renders mode switcher with Default Memory and Project-Only Memory', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      expect(html).toContain('Default Memory');
      expect(html).toContain('Project-Only Memory');
      expect(html).toContain('Isolated Boundary Active');
    });

    it('renders shield icon when in PROJECT_ISOLATED mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      expect(html).toContain('data-testid="shield-icon"');
      expect(html).toContain('Strict Project Isolation Enforced');
    });

    it('renders live character counter for custom instructions', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      const len = sampleMemory.customInstructions.length;
      expect(html).toContain(`${len} / 4000 characters`);
      expect(html).toContain('Save Instructions');
    });

    it('renders pinned memories and category badges', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectMemoryManager, {
          projectId: 'proj-enterprise-1',
          initialMemory: sampleMemory,
        }),
      );

      expect(html).toContain('Core architecture must use isolated FastCDC chunks.');
      expect(html).toContain('architecture');
      expect(html).toContain('📌 Pinned');
      expect(html).toContain('📌 1 Pinned');
    });
  });

  // ==========================================================================
  // 2. Interactive DOM Behavior & User Actions
  // ==========================================================================
  describe('Interactive User Actions & Mode Switching', () => {
    it('switches memory mode from PROJECT_ISOLATED to DEFAULT', async () => {
      const onMemoryUpdate = vi.fn();

      root = createRoot(container!);
      await act(async () => {
        root?.render(
          React.createElement(ProjectMemoryManager, {
            projectId: 'proj-enterprise-1',
            initialMemory: sampleMemory,
            onMemoryUpdate,
          }),
        );
      });

      const defaultBtn = container!.querySelector(
        '[data-testid="mode-default-btn"]',
      ) as HTMLButtonElement;
      expect(defaultBtn).not.toBeNull();

      await act(async () => {
        defaultBtn.click();
      });

      expect(onMemoryUpdate).toHaveBeenCalled();
      const updated = onMemoryUpdate.mock.calls[0]![0] as ProjectMemory;
      expect(updated.memoryMode).toBe('DEFAULT');
    });

    it('updates custom instructions draft and saves via button', async () => {
      const onMemoryUpdate = vi.fn();

      root = createRoot(container!);
      await act(async () => {
        root?.render(
          React.createElement(ProjectMemoryManager, {
            projectId: 'proj-enterprise-1',
            initialMemory: sampleMemory,
            onMemoryUpdate,
          }),
        );
      });

      const textarea = container!.querySelector(
        '[data-testid="custom-instructions-input"]',
      ) as HTMLTextAreaElement;
      const counter = container!.querySelector('[data-testid="char-counter"]') as HTMLDivElement;
      const saveBtn = container!.querySelector(
        '[data-testid="save-instructions-btn"]',
      ) as HTMLButtonElement;

      expect(textarea).not.toBeNull();
      expect(counter.textContent).toContain(
        `${sampleMemory.customInstructions.length} / 4000 characters`,
      );

      // Simulate typing new instructions
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        nativeInputValueSetter?.call(textarea, 'Always enforce zero mock in production code.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(counter.textContent).toContain('44 / 4000 characters');

      await act(async () => {
        saveBtn.click();
      });

      expect(onMemoryUpdate).toHaveBeenCalled();
      const lastCall = onMemoryUpdate.mock.calls[
        onMemoryUpdate.mock.calls.length - 1
      ]![0] as ProjectMemory;
      expect(lastCall.customInstructions).toBe('Always enforce zero mock in production code.');
    });

    it('adds a new workspace memory entry with category and pin option', async () => {
      const onMemoryUpdate = vi.fn();

      root = createRoot(container!);
      await act(async () => {
        root?.render(
          React.createElement(ProjectMemoryManager, {
            projectId: 'proj-enterprise-1',
            initialMemory: sampleMemory,
            onMemoryUpdate,
          }),
        );
      });

      const input = container!.querySelector(
        '[data-testid="add-memory-input"]',
      ) as HTMLInputElement;
      const pinCheckbox = container!.querySelector(
        '[data-testid="pin-checkbox"]',
      ) as HTMLInputElement;
      const addBtn = container!.querySelector(
        '[data-testid="add-memory-btn"]',
      ) as HTMLButtonElement;

      expect(input).not.toBeNull();

      // Enter memory text and check pin
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeInputValueSetter?.call(input, 'Ensure 100% green Vitest tests with tsc --noEmit.');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        pinCheckbox.click();
      });

      await act(async () => {
        addBtn.click();
      });

      expect(onMemoryUpdate).toHaveBeenCalled();
      const lastCall = onMemoryUpdate.mock.calls[
        onMemoryUpdate.mock.calls.length - 1
      ]![0] as ProjectMemory;
      expect(lastCall.memoryEntries).toHaveLength(3);
      expect(lastCall.memoryEntries[0]?.content).toBe(
        'Ensure 100% green Vitest tests with tsc --noEmit.',
      );
      expect(lastCall.memoryEntries[0]?.isPinned).toBe(true);
    });

    it('toggles pin state on an existing memory card', async () => {
      const onMemoryUpdate = vi.fn();

      root = createRoot(container!);
      await act(async () => {
        root?.render(
          React.createElement(ProjectMemoryManager, {
            projectId: 'proj-enterprise-1',
            initialMemory: sampleMemory,
            onMemoryUpdate,
          }),
        );
      });

      const togglePinBtns = container!.querySelectorAll('[data-testid="toggle-pin-btn"]');
      expect(togglePinBtns.length).toBeGreaterThan(0);

      // Toggle first entry (which is pinned -> becomes unpinned)
      await act(async () => {
        (togglePinBtns[0] as HTMLButtonElement).click();
      });

      expect(onMemoryUpdate).toHaveBeenCalled();
      const lastCall = onMemoryUpdate.mock.calls[
        onMemoryUpdate.mock.calls.length - 1
      ]![0] as ProjectMemory;
      const target = lastCall.memoryEntries.find((e) => e.id === 'mem-1');
      expect(target?.isPinned).toBe(false);
    });

    it('deletes a memory entry when clicking delete button', async () => {
      const onMemoryUpdate = vi.fn();

      root = createRoot(container!);
      await act(async () => {
        root?.render(
          React.createElement(ProjectMemoryManager, {
            projectId: 'proj-enterprise-1',
            initialMemory: sampleMemory,
            onMemoryUpdate,
          }),
        );
      });

      const deleteBtns = container!.querySelectorAll('[data-testid="delete-memory-btn"]');
      expect(deleteBtns.length).toBe(2);

      await act(async () => {
        (deleteBtns[0] as HTMLButtonElement).click();
      });

      expect(onMemoryUpdate).toHaveBeenCalled();
      const lastCall = onMemoryUpdate.mock.calls[
        onMemoryUpdate.mock.calls.length - 1
      ]![0] as ProjectMemory;
      expect(lastCall.memoryEntries).toHaveLength(1);
    });
  });
});
