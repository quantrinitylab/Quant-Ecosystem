// @vitest-environment jsdom
// ============================================================================
// @quant/shared-ui - QuantSidekick / AlienAvatar tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AlienAvatar } from '../AlienAvatar';
import { QuantSidekick, QuantSidekickProvider, useQuantSidekick } from '../QuantSidekick';

describe('AlienAvatar', () => {
  it('renders an accessible img with a state-aware label and data-state', () => {
    const { rerender } = render(<AlienAvatar state="idle" />);
    const el = screen.getByTestId('quant-alien-avatar');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('data-state')).toBe('idle');
    expect(el.getAttribute('aria-label')).toMatch(/idle/i);

    rerender(<AlienAvatar state="thinking" />);
    const el2 = screen.getByTestId('quant-alien-avatar');
    expect(el2.getAttribute('data-state')).toBe('thinking');
    expect(el2.getAttribute('aria-label')).toMatch(/thinking/i);
  });

  it('honors a custom label and size', () => {
    render(<AlienAvatar state="speaking" label="Quant helper" size={40} />);
    const el = screen.getByLabelText('Quant helper');
    expect(el).toBeTruthy();
    expect(el.style.width).toBe('40px');
  });
});

describe('useQuantSidekick', () => {
  it('throws when used outside a provider', () => {
    function Bad() {
      useQuantSidekick();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/QuantSidekickProvider|EcosystemShell/);
  });
});

function Harness() {
  const sk = useQuantSidekick();
  return (
    <div>
      <span data-testid="status">{sk.status}</span>
      <button onClick={() => sk.say('Done!', 'speaking')}>say</button>
      <button
        onClick={() =>
          sk.setSuggestions([{ id: 's1', label: 'Summarize inbox', onSelect: () => {} }])
        }
      >
        suggest
      </button>
      <button onClick={() => void sk.runTask(async () => 42, { speakOnDone: 'Built it' })}>
        run
      </button>
    </div>
  );
}

describe('QuantSidekick widget + provider', () => {
  // QuantSidekick renders nothing until the user has opted in (`enabled`, hydrated from
  // `localStorage['quant_sidekick_enabled']`) or something has explicitly opened it. Tests
  // that need the widget on screen must opt in first; see the visibility-gate tests below.
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing until the user has enabled it', () => {
    render(
      <QuantSidekickProvider>
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    expect(screen.queryByTestId('quant-sidekick')).toBeNull();
    expect(screen.queryByTestId('quant-sidekick-toggle')).toBeNull();
  });

  it('renders when opened programmatically even if not enabled', () => {
    render(
      <QuantSidekickProvider initialOpen>
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    expect(screen.getByTestId('quant-sidekick-panel')).toBeTruthy();
  });

  it('toggles the panel open/closed via the alien button', () => {
    localStorage.setItem('quant_sidekick_enabled', 'true');
    render(
      <QuantSidekickProvider>
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    expect(screen.queryByTestId('quant-sidekick-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('quant-sidekick-toggle'));
    expect(screen.getByTestId('quant-sidekick-panel')).toBeTruthy();
    // ...and back closed again, which the original assertion never actually covered.
    fireEvent.click(screen.getByTestId('quant-sidekick-toggle'));
    expect(screen.queryByTestId('quant-sidekick-panel')).toBeNull();
  });

  it('say() shows a message, opens the panel and moves to speaking', () => {
    render(
      <QuantSidekickProvider>
        <Harness />
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    fireEvent.click(screen.getByText('say'));
    expect(screen.getByTestId('status').textContent).toBe('speaking');
    expect(screen.getByTestId('quant-sidekick-message').textContent).toBe('Done!');
  });

  it('renders contextual suggestions when set', () => {
    render(
      <QuantSidekickProvider initialOpen>
        <Harness />
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    fireEvent.click(screen.getByText('suggest'));
    expect(screen.getByText('Summarize inbox')).toBeTruthy();
  });

  it('runTask drives thinking -> speaking with the done message', async () => {
    render(
      <QuantSidekickProvider>
        <Harness />
        <QuantSidekick />
      </QuantSidekickProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('run'));
    });
    expect(screen.getByTestId('status').textContent).toBe('speaking');
    expect(screen.getByTestId('quant-sidekick-message').textContent).toBe('Built it');
  });
});
