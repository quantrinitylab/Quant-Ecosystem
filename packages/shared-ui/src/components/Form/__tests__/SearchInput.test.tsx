// @vitest-environment jsdom
// ============================================================================
// Shared UI - SearchInput Tests
// ============================================================================
//
// This component shipped with `defaultValue={value}` and a clear button that
// only called `onChange('')`. Every assertion below about `input.value` failed
// against that version: the results cleared and the text stayed on screen.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { SearchInput } from '../SearchInput';

const field = () => screen.getByRole('searchbox') as HTMLInputElement;
const clearButton = () => screen.queryByRole('button', { name: 'Clear search' });

/** The shape all five real call sites use: `value={state} onChange={setState}`. */
function Controlled({ onEmit }: { onEmit?: (v: string) => void }) {
  const [query, setQuery] = useState('');
  return (
    <>
      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          onEmit?.(v);
        }}
      />
      <output data-testid="parent-state">{query}</output>
      <button type="button" onClick={() => setQuery('')}>
        Reset from parent
      </button>
    </>
  );
}

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces onChange to one call for a burst of keystrokes', () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} />);

    fireEvent.change(field(), { target: { value: 'a' } });
    fireEvent.change(field(), { target: { value: 'au' } });
    fireEvent.change(field(), { target: { value: 'auth' } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('auth');
  });

  it('shows what was typed immediately, without waiting for the debounce', () => {
    render(<SearchInput onChange={vi.fn()} />);

    fireEvent.change(field(), { target: { value: 'auth' } });

    // The field is the typist's, not the parent's. Gating either the text or the
    // ✕ on the debounced prop made both lag a keystroke by 300ms.
    expect(field().value).toBe('auth');
    expect(clearButton()).not.toBeNull();
  });

  it('empties the field when cleared, not just the parent state', () => {
    const onEmit = vi.fn();
    render(<Controlled onEmit={onEmit} />);

    fireEvent.change(field(), { target: { value: 'auth' } });
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByTestId('parent-state').textContent).toBe('auth');

    act(() => void clearButton()!.click());

    expect(field().value).toBe('');
    expect(screen.getByTestId('parent-state').textContent).toBe('');
    expect(onEmit).toHaveBeenLastCalledWith('');
    expect(clearButton()).toBeNull();
  });

  it('keeps focus in the field after clearing', () => {
    render(<SearchInput onChange={vi.fn()} />);

    fireEvent.change(field(), { target: { value: 'auth' } });
    act(() => void clearButton()!.click());

    // The button unmounts on clear, so without an explicit refocus a keyboard
    // user is dropped onto document.body and has to tab in from the top.
    expect(document.activeElement).toBe(field());
  });

  it('does not let a pending debounce resurrect the query after a clear', () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} />);

    fireEvent.change(field(), { target: { value: 'auth' } });
    // Clear inside the debounce window, while a timer still holds 'auth'.
    act(() => void vi.advanceTimersByTime(150));
    act(() => void clearButton()!.click());
    expect(onChange).toHaveBeenLastCalledWith('');

    act(() => void vi.advanceTimersByTime(1000));

    // 'auth' must never arrive after ''. An uncancelled timer would deliver it
    // 150ms later, re-running a search whose text is no longer on screen.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(field().value).toBe('');
  });

  it('adopts an external value change but ignores the parent echoing its own', () => {
    render(<Controlled />);

    fireEvent.change(field(), { target: { value: 'auth' } });
    // The parent echoes 'auth' back as a new `value` prop here. Adopting that
    // echo is what would fight a typist mid-word, so it must be a no-op.
    act(() => void vi.advanceTimersByTime(300));
    expect(field().value).toBe('auth');

    fireEvent.click(screen.getByRole('button', { name: 'Reset from parent' }));

    // A value the component did not emit is the parent genuinely changing the
    // query — a "clear all" control, a restored URL — and it has to win.
    expect(field().value).toBe('');
  });

  it('renders an initial value and swaps the ✕ for the spinner while loading', () => {
    const { rerender } = render(<SearchInput value="auth" onChange={vi.fn()} />);
    expect(field().value).toBe('auth');
    expect(clearButton()).not.toBeNull();

    // The live region exists and is silent before there is anything to say — a
    // `role="status"` node inserted at the same instant it first has text is the
    // case screen readers most often miss entirely.
    expect(screen.getByRole('status').textContent).toBe('');

    rerender(<SearchInput value="auth" onChange={vi.fn()} loading />);
    expect(clearButton()).toBeNull();
    // The name used to sit on the spinner itself: a contentless span, which maps
    // to `role="generic"` where `aria-label` is prohibited and dropped — and a
    // name on decoration is not an announcement even when it survives.
    expect(screen.getByRole('status').textContent).toBe('Loading search results');
    expect(screen.queryByLabelText('Loading search results')).toBeNull();
  });

  it('emits synchronously when debouncing is switched off', () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} debounceMs={0} />);

    fireEvent.change(field(), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
