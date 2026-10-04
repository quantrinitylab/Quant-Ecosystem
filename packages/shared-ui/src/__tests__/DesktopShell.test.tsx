// @vitest-environment jsdom
// ============================================================================
// @quant/shared-ui - DesktopShell Component Tests
// Amazon & Flipkart-parity 5-Pillar Squircle Mode Switcher & Dynamic Island
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
import {
  DesktopShell,
  SquircleModeSwitcher,
  DynamicIslandCapsule,
  DESKTOP_PILLARS,
  getPillarIcon,
  MailPillarIcon,
  CalendarPillarIcon,
  DrivePillarIcon,
  ContactsPillarIcon,
  QuantGitPillarIcon,
  QuantAiSparkleIcon,
  SovereignClusterSignalIcon,
  MinimizeWindowIcon,
  MaximizeWindowIcon,
  CloseWindowIcon,
  type PillarId,
} from '../DesktopShell';

describe('DesktopShell - 5-Pillar Sovereign Architecture', () => {
  describe('DESKTOP_PILLARS Specification & Invariants', () => {
    it('defines exactly the 5 sovereign pillars in correct order', () => {
      const ids = DESKTOP_PILLARS.map((p) => p.id);
      expect(ids).toEqual(['mail', 'calendar', 'drive', 'contacts', 'quantgit']);
      expect(DESKTOP_PILLARS).toHaveLength(5);
    });

    it('verifies exact Amazon/Flipkart-parity accent colors and hotkeys', () => {
      // 1. Mail (#FF8C42, hotkey Ctrl+1)
      const mail = DESKTOP_PILLARS.find((p) => p.id === 'mail')!;
      expect(mail.name).toBe('Mail');
      expect(mail.accentColor).toBe('#FF8C42');
      expect(mail.hotkey).toBe('Ctrl+1');
      expect(mail.keyNumber).toBe(1);
      expect(mail.route).toBe('/mail');

      // 2. Calendar (#F59E0B, hotkey Ctrl+2)
      const calendar = DESKTOP_PILLARS.find((p) => p.id === 'calendar')!;
      expect(calendar.name).toBe('Calendar');
      expect(calendar.accentColor).toBe('#F59E0B');
      expect(calendar.hotkey).toBe('Ctrl+2');
      expect(calendar.keyNumber).toBe(2);
      expect(calendar.route).toBe('/calendar');

      // 3. Drive (#38BDF8, hotkey Ctrl+3)
      const drive = DESKTOP_PILLARS.find((p) => p.id === 'drive')!;
      expect(drive.name).toBe('Drive');
      expect(drive.accentColor).toBe('#38BDF8');
      expect(drive.hotkey).toBe('Ctrl+3');
      expect(drive.keyNumber).toBe(3);
      expect(drive.route).toBe('/drive');

      // 4. Contacts (#10B981, hotkey Ctrl+4)
      const contacts = DESKTOP_PILLARS.find((p) => p.id === 'contacts')!;
      expect(contacts.name).toBe('Contacts');
      expect(contacts.accentColor).toBe('#10B981');
      expect(contacts.hotkey).toBe('Ctrl+4');
      expect(contacts.keyNumber).toBe(4);
      expect(contacts.route).toBe('/contacts');

      // 5. QuantGit (#A78BFA, hotkey Ctrl+5)
      const quantgit = DESKTOP_PILLARS.find((p) => p.id === 'quantgit')!;
      expect(quantgit.name).toBe('QuantGit');
      expect(quantgit.accentColor).toBe('#A78BFA');
      expect(quantgit.hotkey).toBe('Ctrl+5');
      expect(quantgit.keyNumber).toBe(5);
      expect(quantgit.route).toBe('/quantgit');
    });
  });

  describe('Pure SVG Vector Icons (Strictly Zero Emojis)', () => {
    it('renders vector SVG icons for all 5 pillars via getPillarIcon', () => {
      const pillars: PillarId[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
      for (const pillar of pillars) {
        const { container } = render(getPillarIcon(pillar, { size: 20, className: 'test-icon' }));
        const svg = container.querySelector('svg');
        expect(svg).toBeDefined();
        expect(svg?.getAttribute('width')).toBe('20');
        expect(svg?.getAttribute('height')).toBe('20');
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('renders dedicated SVG icons with valid properties', () => {
      const icons = [
        <MailPillarIcon key="mail" />,
        <CalendarPillarIcon key="cal" />,
        <DrivePillarIcon key="drive" />,
        <ContactsPillarIcon key="contacts" />,
        <QuantGitPillarIcon key="git" />,
        <QuantAiSparkleIcon key="sparkle" />,
        <SovereignClusterSignalIcon key="signal" />,
        <MinimizeWindowIcon key="min" />,
        <MaximizeWindowIcon key="max" />,
        <CloseWindowIcon key="close" />,
      ];

      for (const icon of icons) {
        const { container } = render(icon);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('fill')).toBe('none');
      }
    });
  });

  describe('DynamicIslandCapsule Component', () => {
    it('renders sleek frosted pill with "Quant AI: Connected · Sovereign Cluster <5ms"', () => {
      render(<DynamicIslandCapsule />);
      const capsule = screen.getByTestId('dynamic-island-capsule');
      expect(capsule).toBeDefined();
      expect(capsule.textContent).toContain('Quant AI:');
      expect(capsule.textContent).toContain('Connected');
      expect(capsule.textContent).toContain('Sovereign Cluster');
      expect(capsule.textContent).toContain('<5ms');
      expect(screen.getByTestId('dynamic-island-ai-icon')).toBeDefined();
    });

    it('displays custom telemetry latency and disconnected status correctly', () => {
      render(
        <DynamicIslandCapsule
          statusText="Reconnecting"
          connected={false}
          latencyText="12ms"
        />,
      );
      const capsule = screen.getByTestId('dynamic-island-capsule');
      expect(capsule.textContent).toContain('Reconnecting');
      expect(capsule.textContent).toContain('12ms');
      expect(screen.getByTestId('dynamic-island-latency').textContent).toBe('12ms');
    });

    it('handles click callback when passed', () => {
      const handleClick = vi.fn();
      render(<DynamicIslandCapsule onClick={handleClick} />);
      const capsule = screen.getByTestId('dynamic-island-capsule');
      fireEvent.click(capsule);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('SquircleModeSwitcher Component', () => {
    it('renders 5 squircle mode selector tiles with tab semantics', () => {
      render(
        <SquircleModeSwitcher
          activePillar="mail"
          onSelectPillar={() => {}}
        />,
      );

      const nav = screen.getByRole('tablist');
      expect(nav).toBeDefined();
      expect(nav.getAttribute('aria-label')).toBe('5-Pillar Mode Switcher');

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(5);
    });

    it('renders active mode with soft-glow styling, wordmark, and bottom accent line', () => {
      render(
        <SquircleModeSwitcher
          activePillar="mail"
          onSelectPillar={() => {}}
        />,
      );

      const mailTile = screen.getByTestId('squircle-tile-mail');
      expect(mailTile.getAttribute('data-active')).toBe('true');
      expect(mailTile.getAttribute('aria-selected')).toBe('true');

      // Active mode has subtle bottom accent line
      const accentLine = screen.getByTestId('squircle-accent-line-mail');
      expect(accentLine).toBeDefined();

      // Wordmark is rendered
      expect(screen.getByTestId('squircle-wordmark-mail').textContent).toBe('Mail');

      // Inactive tiles do not have bottom accent line
      expect(screen.queryByTestId('squircle-accent-line-calendar')).toBeNull();
      expect(screen.queryByTestId('squircle-accent-line-drive')).toBeNull();
      expect(screen.queryByTestId('squircle-accent-line-contacts')).toBeNull();
      expect(screen.queryByTestId('squircle-accent-line-quantgit')).toBeNull();
    });

    it('renders hotkey badges (^1..^5 on Windows/Linux and ⌘1..⌘5 on Mac)', () => {
      const { rerender } = render(
        <SquircleModeSwitcher
          activePillar="mail"
          onSelectPillar={() => {}}
          isMac={false}
        />,
      );
      expect(screen.getByTestId('squircle-hotkey-mail').textContent).toBe('^1');
      expect(screen.getByTestId('squircle-hotkey-calendar').textContent).toBe('^2');
      expect(screen.getByTestId('squircle-hotkey-drive').textContent).toBe('^3');
      expect(screen.getByTestId('squircle-hotkey-contacts').textContent).toBe('^4');
      expect(screen.getByTestId('squircle-hotkey-quantgit').textContent).toBe('^5');

      rerender(
        <SquircleModeSwitcher
          activePillar="mail"
          onSelectPillar={() => {}}
          isMac={true}
        />,
      );
      expect(screen.getByTestId('squircle-hotkey-mail').textContent).toBe('⌘1');
      expect(screen.getByTestId('squircle-hotkey-calendar').textContent).toBe('⌘2');
      expect(screen.getByTestId('squircle-hotkey-drive').textContent).toBe('⌘3');
      expect(screen.getByTestId('squircle-hotkey-contacts').textContent).toBe('⌘4');
      expect(screen.getByTestId('squircle-hotkey-quantgit').textContent).toBe('⌘5');
    });

    it('fires onSelectPillar when clicking a tile', () => {
      const handleSelect = vi.fn();
      render(
        <SquircleModeSwitcher
          activePillar="mail"
          onSelectPillar={handleSelect}
        />,
      );

      fireEvent.click(screen.getByTestId('squircle-tile-calendar'));
      expect(handleSelect).toHaveBeenCalledWith('calendar');

      fireEvent.click(screen.getByTestId('squircle-tile-quantgit'));
      expect(handleSelect).toHaveBeenCalledWith('quantgit');
    });
  });

  describe('DesktopShell Master Component', () => {
    it('renders complete shell layout with brand, mode switcher, dynamic island, and viewport', () => {
      render(<DesktopShell defaultPillar="mail" />);

      expect(screen.getByTestId('quant-desktop-shell')).toBeDefined();
      expect(screen.getByTestId('quant-desktop-header')).toBeDefined();
      expect(screen.getByTestId('brand-glyph').textContent).toBe('Q');
      expect(screen.getByText('Quant Desktop')).toBeDefined();
      expect(screen.getByTestId('squircle-mode-switcher')).toBeDefined();
      expect(screen.getByTestId('dynamic-island-capsule')).toBeDefined();
      expect(screen.getByTestId('window-controls-bar')).toBeDefined();
      expect(screen.getByTestId('pillar-panel-mail')).toBeDefined();
    });

    it('switches pillar in uncontrolled mode when clicking squircle mode tiles', () => {
      render(<DesktopShell defaultPillar="mail" />);

      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId('default-pillar-placeholder').textContent).toContain('Mail');

      // Click Calendar tile
      fireEvent.click(screen.getByTestId('squircle-tile-calendar'));
      expect(screen.getByTestId('squircle-tile-calendar').getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('false');
      expect(screen.getByTestId('pillar-panel-calendar')).toBeDefined();
      expect(screen.getByTestId('default-pillar-placeholder').textContent).toContain('Calendar');

      // Click Drive tile
      fireEvent.click(screen.getByTestId('squircle-tile-drive'));
      expect(screen.getByTestId('squircle-tile-drive').getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId('default-pillar-placeholder').textContent).toContain('Drive');
    });

    it('respects controlled activePillar and calls onSelectPillar', () => {
      const handleSelect = vi.fn();
      const { rerender } = render(
        <DesktopShell
          activePillar="mail"
          onSelectPillar={handleSelect}
        />,
      );

      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');

      fireEvent.click(screen.getByTestId('squircle-tile-contacts'));
      expect(handleSelect).toHaveBeenCalledWith('contacts');

      // Rerender as controlled with new activePillar
      rerender(
        <DesktopShell
          activePillar="contacts"
          onSelectPillar={handleSelect}
        />,
      );
      expect(screen.getByTestId('squircle-tile-contacts').getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('false');
    });

    it('renders custom children in viewport when provided', () => {
      render(
        <DesktopShell defaultPillar="mail">
          <div data-testid="custom-app-view">Custom Mail Client View</div>
        </DesktopShell>,
      );

      expect(screen.getByTestId('custom-app-view')).toBeDefined();
      expect(screen.queryByTestId('default-pillar-placeholder')).toBeNull();
    });

    it('renders headerRightSlot and custom brandTitle', () => {
      render(
        <DesktopShell
          brandTitle="Quant Desktop Enterprise"
          headerRightSlot={<div data-testid="custom-slot">Profile Avatar</div>}
        />,
      );

      expect(screen.getByText('Quant Desktop Enterprise')).toBeDefined();
      expect(screen.getByTestId('custom-slot')).toBeDefined();
    });

    it('invokes window action handlers on click', () => {
      const handleMin = vi.fn();
      const handleMax = vi.fn();
      const handleClose = vi.fn();

      render(
        <DesktopShell
          onMinimize={handleMin}
          onMaximize={handleMax}
          onClose={handleClose}
        />,
      );

      fireEvent.click(screen.getByLabelText('Minimize Window'));
      expect(handleMin).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('Maximize Window'));
      expect(handleMax).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('Close Window'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('switches pillar via Ctrl+1 through Ctrl+5 keyboard shortcuts', () => {
      render(<DesktopShell defaultPillar="mail" />);

      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');

      // Ctrl+2 -> Calendar
      fireEvent.keyDown(window, { key: '2', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-calendar').getAttribute('data-active')).toBe('true');

      // Ctrl+3 -> Drive
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-drive').getAttribute('data-active')).toBe('true');

      // Ctrl+4 -> Contacts
      fireEvent.keyDown(window, { key: '4', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-contacts').getAttribute('data-active')).toBe('true');

      // Ctrl+5 -> QuantGit
      fireEvent.keyDown(window, { key: '5', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-quantgit').getAttribute('data-active')).toBe('true');

      // Ctrl+1 -> Mail
      fireEvent.keyDown(window, { key: '1', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');
    });

    it('switches pillar via Cmd+1 through Cmd+5 on macOS', () => {
      render(<DesktopShell defaultPillar="mail" />);

      // Cmd+4 -> Contacts
      fireEvent.keyDown(window, { key: '4', metaKey: true });
      expect(screen.getByTestId('squircle-tile-contacts').getAttribute('data-active')).toBe('true');
    });

    it('supports Digit and Numpad e.code fallbacks', () => {
      render(<DesktopShell defaultPillar="mail" />);

      // e.code = 'Digit3'
      fireEvent.keyDown(window, { key: 'Unidentified', code: 'Digit3', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-drive').getAttribute('data-active')).toBe('true');

      // e.code = 'Numpad5'
      fireEvent.keyDown(window, { key: 'Unidentified', code: 'Numpad5', ctrlKey: true });
      expect(screen.getByTestId('squircle-tile-quantgit').getAttribute('data-active')).toBe('true');
    });

    it('ignores hotkey when Alt or Shift modifier is pressed', () => {
      render(<DesktopShell defaultPillar="mail" />);

      // Ctrl+Alt+2 should NOT switch to Calendar (could be third-party or OS shortcut)
      fireEvent.keyDown(window, { key: '2', ctrlKey: true, altKey: true });
      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');

      // Ctrl+Shift+3 should NOT switch to Drive
      fireEvent.keyDown(window, { key: '3', ctrlKey: true, shiftKey: true });
      expect(screen.getByTestId('squircle-tile-mail').getAttribute('data-active')).toBe('true');
    });
  });
});
