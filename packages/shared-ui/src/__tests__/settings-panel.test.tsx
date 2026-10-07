// @vitest-environment jsdom
// ============================================================================
// Shared UI - SettingsPanel Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../components/Shell/SettingsPanel';

describe('SettingsPanel', () => {
  const defaultProps = {
    profile: { name: 'Test User', email: 'test@quant.dev' },
    theme: 'system' as const,
    onThemeChange: vi.fn(),
    onAccentColorChange: vi.fn(),
    notificationPreferences: [
      { appId: 'mail', appName: 'QuantMail', enabled: true },
      { appId: 'chat', appName: 'QuantChat', enabled: false },
    ],
    onNotificationToggle: vi.fn(),
    privacySettings: { dataSharing: false, analytics: true },
    onPrivacyChange: vi.fn(),
    shortcuts: [
      {
        scope: 'Global',
        shortcuts: [
          { combo: 'Cmd+K', description: 'Open command palette' },
          { combo: 'Cmd+/', description: 'Search' },
        ],
      },
    ],
    onProfileUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with settings region', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByRole('region', { name: /settings/i })).toBeDefined();
  });

  it('renders all tab buttons', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /profile/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /appearance/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /notifications/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /privacy/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /shortcuts/i })).toBeDefined();
  });

  it('shows Profile tab content by default', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByLabelText('Your name')).toBeDefined();
    expect(screen.getByLabelText('Your email')).toBeDefined();
  });

  it('switches to Appearance tab on click', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));
    expect(screen.getByRole('radio', { name: /light theme/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /dark theme/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /system theme/i })).toBeDefined();
  });

  it('calls onThemeChange when theme option is clicked', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));
    fireEvent.click(screen.getByRole('radio', { name: /dark theme/i }));
    expect(defaultProps.onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('switches to Notifications tab and shows per-app toggles', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }));
    expect(screen.getByLabelText('Notifications for QuantMail')).toBeDefined();
    expect(screen.getByLabelText('Notifications for QuantChat')).toBeDefined();
  });

  it('calls onNotificationToggle when notification checkbox is toggled', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }));
    const chatCheckbox = screen.getByLabelText('Notifications for QuantChat');
    fireEvent.click(chatCheckbox);
    expect(defaultProps.onNotificationToggle).toHaveBeenCalledWith('chat', true);
  });

  it('switches to Privacy tab and shows toggles', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /privacy/i }));
    expect(screen.getByLabelText('Share usage data')).toBeDefined();
    expect(screen.getByLabelText('Allow analytics')).toBeDefined();
  });

  it('calls onPrivacyChange when privacy toggle is clicked', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /privacy/i }));
    fireEvent.click(screen.getByLabelText('Share usage data'));
    expect(defaultProps.onPrivacyChange).toHaveBeenCalledWith('dataSharing', true);
  });

  it('switches to Shortcuts tab and shows registered shortcuts', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /shortcuts/i }));
    expect(screen.getByText('Open command palette')).toBeDefined();
    expect(screen.getByText('Cmd+K')).toBeDefined();
    expect(screen.getByText('Search')).toBeDefined();
  });

  it('calls onProfileUpdate when Save is clicked', () => {
    render(<SettingsPanel {...defaultProps} />);
    const nameInput = screen.getByLabelText('Your name');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.click(screen.getByLabelText('Save profile'));
    expect(defaultProps.onProfileUpdate).toHaveBeenCalledWith('New Name', 'test@quant.dev');
  });

  // Every tab used to point `aria-controls` at `settings-profile`, `settings-appearance`
  // and so on, and no element in the file ever rendered those ids. Asserting the
  // string would have passed the whole time; the only assertion worth making is
  // that the id resolves to something.
  it('wires each tab to a panel that exists, in both directions', () => {
    render(<SettingsPanel {...defaultProps} />);
    const tab = screen.getByRole('tab', { name: /profile/i });
    const controls = tab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    // `getElementById`, not `querySelector`: a `useId` value contains colons, so
    // `#${id}` is not a valid CSS selector and querySelector throws on it.
    const panel = document.getElementById(controls as string);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    // ...and back: the panel is named by the tab rather than by a hand-written
    // `aria-label` that no longer has to be kept in step with it.
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('renders exactly one tabpanel, and follows the selected tab', () => {
    render(<SettingsPanel {...defaultProps} />);
    // Five `role="tabpanel"` divs used to be declared across the five renderers.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    fireEvent.click(screen.getByRole('tab', { name: /shortcuts/i }));
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: /shortcuts/i }).id,
    );
  });

  it('keeps exactly one tab in the tab sequence', () => {
    render(<SettingsPanel {...defaultProps} />);
    const inSequence = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0);
    expect(inSequence).toHaveLength(1);
    expect(inSequence[0]).toBe(screen.getByRole('tab', { name: /profile/i }));
  });

  // `role="tablist"` is a promise about the keyboard. This shipped with no key
  // handler at all, so the role described a widget that did not exist.
  it('moves selection and focus with the arrow keys, wrapping at the ends', () => {
    render(<SettingsPanel {...defaultProps} />);
    const profile = screen.getByRole('tab', { name: /profile/i });
    profile.focus();

    fireEvent.keyDown(profile, { key: 'ArrowRight' });
    const appearance = screen.getByRole('tab', { name: /appearance/i });
    expect(appearance.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(appearance);
    // Selection follows focus, so the panel came along with it.
    expect(screen.getByRole('radio', { name: /light theme/i })).toBeDefined();

    // A ring, not a strip with two dead ends: Left from the first lands on the last.
    fireEvent.keyDown(appearance, { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: /profile/i }), { key: 'ArrowLeft' });
    const shortcuts = screen.getByRole('tab', { name: /shortcuts/i });
    expect(shortcuts.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(shortcuts);
  });

  it('jumps to the ends with Home and End', () => {
    render(<SettingsPanel {...defaultProps} />);
    const profile = screen.getByRole('tab', { name: /profile/i });
    fireEvent.keyDown(profile, { key: 'End' });
    expect(screen.getByRole('tab', { name: /shortcuts/i }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: /shortcuts/i }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: /profile/i }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  // A horizontal strip must not claim the vertical arrows: taking page-scroll away
  // from someone reading a long settings surface is a worse trade than one extra
  // key press.
  it('leaves ArrowDown alone', () => {
    render(<SettingsPanel {...defaultProps} />);
    const profile = screen.getByRole('tab', { name: /profile/i });
    const handled = fireEvent.keyDown(profile, { key: 'ArrowDown' });
    expect(handled).toBe(true); // not preventDefault()ed
    expect(profile.getAttribute('aria-selected')).toBe('true');
  });

  // Both `radiogroup`s had every radio in the tab sequence and no key handler —
  // nine tab stops where two groups should contribute two.
  it('gives each radiogroup one tab stop and working arrow keys', () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));

    const themes = screen.getAllByRole('radio', { name: /theme$/i });
    expect(themes.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    // `theme: 'system'` is the third of three, so the cursor sits there.
    expect(screen.getByRole('radio', { name: /system theme/i }).tabIndex).toBe(0);

    // Selection follows focus for radios, so the arrow key is the change.
    fireEvent.keyDown(screen.getByRole('radio', { name: /system theme/i }), { key: 'ArrowRight' });
    expect(defaultProps.onThemeChange).toHaveBeenCalledWith('light');

    const swatches = screen.getAllByRole('radio', { name: /^accent color/i });
    expect(swatches).toHaveLength(6);
    expect(swatches.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(swatches[0]!, { key: 'End' });
    expect(defaultProps.onAccentColorChange).toHaveBeenCalledWith('#ec4899');
  });

  // `accentColor` is a prop, so a consumer can pass a colour outside the six. The
  // group has to stay reachable rather than dropping out of the tab sequence.
  it('keeps the accent group reachable when no swatch matches', () => {
    render(<SettingsPanel {...defaultProps} accentColor="#FF8C42" />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));
    const swatches = screen.getAllByRole('radio', { name: /^accent color/i });
    expect(swatches.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(swatches.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(swatches[0]!.tabIndex).toBe(0);
  });
});
