// QuantAI web shell — ShellComposer unit tests.
// Follows the repo's createRoot + act pattern (see auth-guard-handoff tests).

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ShellComposer } from '../components/shell/ShellComposer';
import { SHELL_MODES } from '../components/shell/ModeChips';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type ComposerProps = Parameters<typeof ShellComposer>[0];

function renderComposer(props: Partial<ComposerProps> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = props.onChange ?? vi.fn();
  const onSend = props.onSend ?? vi.fn();
  act(() => {
    root!.render(
      <ShellComposer
        value={props.value ?? ''}
        onChange={onChange}
        onSend={onSend}
        {...props}
      />,
    );
  });
  return {
    onChange: onChange as ReturnType<typeof vi.fn>,
    onSend: onSend as ReturnType<typeof vi.fn>,
  };
}

function sendButton() {
  return container!.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement;
}

function setInputValue(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function composerTextarea() {
  return container!.querySelector(
    'textarea[aria-label="Message"]',
  ) as HTMLTextAreaElement;
}

function dispatchKey(target: HTMLElement, key: string, shiftKey: boolean) {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('ShellComposer', () => {
  it('disables send when the value is empty', () => {
    renderComposer({ value: '' });
    expect(sendButton().disabled).toBe(true);
  });

  it('disables send while loading even with a value', () => {
    renderComposer({ value: 'hello', isLoading: true });
    expect(sendButton().disabled).toBe(true);
  });

  it('enables send with a non-empty value and calls onSend on submit', () => {
    const { onSend } = renderComposer({ value: 'hello' });
    expect(sendButton().disabled).toBe(false);
    act(() => {
      sendButton().click();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not call onSend on submit when the value is empty', () => {
    const { onSend } = renderComposer({ value: '' });
    act(() => {
      container!.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('calls onChange with the typed value', () => {
    const { onChange } = renderComposer({ value: '' });
    const input = composerTextarea();
    setInputValue(input, 'hi there');
    expect(onChange).toHaveBeenCalledWith('hi there');
  });

  it('renders mode chips only when modes are provided and calls onModeChange with the id', () => {
    const onModeChange = vi.fn();
    renderComposer({
      value: '',
      modes: SHELL_MODES,
      activeMode: 'chat',
      onModeChange,
    });
    const chips = container!.querySelectorAll('[aria-label="Modes"] button');
    expect(chips.length).toBe(5);
    act(() => {
      (chips[2] as HTMLButtonElement).click();
    });
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('thinking');
  });

  it('renders no mode chips when modes are not provided', () => {
    renderComposer({ value: '' });
    expect(container!.querySelector('[aria-label="Modes"]')).toBeNull();
  });

  it('renders the effort toggle only when onEffortChange is provided and calls it', () => {
    const onEffortChange = vi.fn();
    renderComposer({ value: '', effort: 'fast', onEffortChange });
    const toggle = container!.querySelector('[aria-label="Effort"]');
    expect(toggle).not.toBeNull();
    const thinking = Array.from(toggle!.querySelectorAll('button')).find(
      (b) => b.textContent === 'thinking',
    ) as HTMLButtonElement;
    act(() => {
      thinking.click();
    });
    expect(onEffortChange).toHaveBeenCalledWith('thinking');
  });

  it('renders no effort toggle without onEffortChange', () => {
    renderComposer({ value: '' });
    expect(container!.querySelector('[aria-label="Effort"]')).toBeNull();
  });

  it('renders no attach/voice buttons without their handlers', () => {
    renderComposer({ value: '' });
    expect(container!.querySelector('button[aria-label="Attach"]')).toBeNull();
    expect(
      container!.querySelector('button[aria-label="Voice input"]'),
    ).toBeNull();
  });

  it('renders attach/voice buttons with handlers and calls them', () => {
    const onAttach = vi.fn();
    const onVoice = vi.fn();
    renderComposer({ value: '', onAttach, onVoice });
    const attach = container!.querySelector(
      'button[aria-label="Attach"]',
    ) as HTMLButtonElement;
    const voice = container!.querySelector(
      'button[aria-label="Voice input"]',
    ) as HTMLButtonElement;
    expect(attach).not.toBeNull();
    expect(voice).not.toBeNull();
    act(() => {
      attach.click();
      voice.click();
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onVoice).toHaveBeenCalledTimes(1);
  });

  it('renders a multi-line auto-growing textarea at rest on one row', () => {
    renderComposer({ value: '' });
    const textarea = composerTextarea();
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.rows).toBe(1);
  });

  it('accepts a multi-line value via onChange', () => {
    const { onChange } = renderComposer({ value: '' });
    setInputValue(composerTextarea(), 'line one\nline two');
    expect(onChange).toHaveBeenCalledWith('line one\nline two');
  });

  it('Shift+Enter does NOT send and does NOT prevent the newline default', () => {
    const { onSend } = renderComposer({ value: 'hello' });
    const event = dispatchKey(composerTextarea(), 'Enter', true);
    expect(event.defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Enter sends and restores focus to the textarea', () => {
    const { onSend } = renderComposer({ value: 'hello' });
    const textarea = composerTextarea();
    const event = dispatchKey(textarea, 'Enter', false);
    expect(event.defaultPrevented).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
  });

  it('Enter does not send when the value is blank', () => {
    const { onSend } = renderComposer({ value: '   ' });
    dispatchKey(composerTextarea(), 'Enter', false);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('restores focus to the textarea after submit via the Send button', () => {
    renderComposer({ value: 'hello' });
    const textarea = composerTextarea();
    act(() => {
      sendButton().click();
    });
    expect(document.activeElement).toBe(textarea);
  });

  it('shows the Enter/Shift+Enter hint and links it via aria-describedby', () => {
    renderComposer({ value: '' });
    const hint = container!.querySelector('#shell-composer-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('Shift + Enter');
    expect(composerTextarea().getAttribute('aria-describedby')).toBe(
      'shell-composer-hint',
    );
  });

  it('uses the default placeholder when none is passed', () => {
    renderComposer({ value: '' });
    expect(composerTextarea().placeholder).toBe('Type a message');
  });

  it('respects a custom placeholder prop (aiUnavailable text)', () => {
    renderComposer({
      value: '',
      placeholder: "AI chat isn't available right now",
      disabled: true,
    });
    expect(composerTextarea().placeholder).toBe(
      "AI chat isn't available right now",
    );
  });

  it('renders NO chips row when modes are provided without onModeChange', () => {
    renderComposer({ value: '', modes: SHELL_MODES });
    expect(container!.querySelector('[aria-label="Modes"]')).toBeNull();
  });
});
