/**
 * accounts-settings-flow.test.tsx
 *
 * Tests for AccountsSettingsFlow (Screens 0, 1, 2, 3 + Appearance, Sender Screening,
 * Editor Language, Sync Settings sub-sheets in both White Light and Black Dark themes).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  AccountsSettingsFlow,
  deriveInitials,
  SHOW_AS_COLORS,
} from '../AccountsSettingsFlow';
import { stripExternalImages } from '../../../lib/safe-html';

const baseProps = {
  profile: {
    displayName: 'Sanjeev Kumar',
    email: 'sanjeev@quantrinity.in',
    username: 'sanjeev',
  },
  hasSignature: true,
  themeLabel: 'Obsidian',
  densityLabel: 'Comfortable',
  aiModeLabel: 'Automatic',
  notificationModeLabel: 'All new mail',
};

describe('AccountsSettingsFlow', () => {
  it('derives two-letter initials accurately from display name or email', () => {
    expect(deriveInitials('Sanjeev Kumar', 'sanjeev@quantrinity.in')).toBe('SK');
    expect(deriveInitials('', 'alex.morgan@quantrinity.in')).toBe('AM');
    expect(deriveInitials('Quant', '')).toBe('QU');
  });

  it('renders Screen 0 (overview Settings Hub) with Quick Settings and General sections', () => {
    const html = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="overview" />,
    );
    expect(html).toContain('Quick Settings');
    expect(html).toContain('Display &amp; Appearance');
    expect(html).toContain('Signature');
    expect(html).toContain('Automatic Replies');
    expect(html).toContain('Notifications &amp; Sounds');
    expect(html).toContain('General');
    expect(html).toContain('Accounts');
    expect(html).toContain('Email');
    expect(html).toContain('Calendar');
    expect(html).toContain('Contacts');
    expect(html).toContain('Face ID / Passkey');
    expect(html).toContain('Privacy');
    expect(html).toContain('Set Default Email App');
    expect(html).toContain('Integrations &amp; Add-Ins');
  });

  it('renders Screen 1 (Accounts list) with primary account, Manage pill, Add Account, and Create New Account', () => {
    const html = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="accounts" />,
    );
    expect(html).toContain('Accounts');
    expect(html).toContain('Edit');
    expect(html).toContain('sanjeev@quantrinity.in');
    expect(html).toContain('SK');
    expect(html).toContain('Manage');
    expect(html).toContain('Add Account');
    expect(html).toContain('Create New Account');
  });

  it('renders Screens 2 & 3 (Account Detail) with Hero Avatar, Description, Show As, Plan, Storage, Email & Calendar, Data Storage, Reset & Remove Account', () => {
    const html = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="detail" />,
    );
    expect(html).toContain('Sanjeev Kumar');
    expect(html).toContain('sanjeev@quantrinity.in');
    expect(html).toContain('Description');
    expect(html).toContain('Show As');
    expect(html).toContain('Plan');
    expect(html).toContain('Storage');
    expect(html).toContain('Email &amp; Calendar');
    expect(html).toContain('Sender Screening');
    expect(html).toContain('Block External Images');
    expect(html).toContain('Quanty Editor');
    expect(html).toContain('Editor Language');
    expect(html).toContain('Report Messages');
    expect(html).toContain('Data Storage');
    expect(html).toContain('Sync Settings');
    expect(html).toContain('Reset Account');
    expect(html).toContain('Remove Account');
    expect(SHOW_AS_COLORS.length).toBeGreaterThanOrEqual(6);
  });

  it('strips external http/https images when Block External Images is enabled', () => {
    const input =
      '<p>Hello</p><img src="https://tracker.example.com/pixel.gif" alt="t" /><img src="data:image/png;base64,AAAA" alt="inline" />';
    const stripped = stripExternalImages(input);
    expect(stripped).not.toContain('https://tracker.example.com/pixel.gif');
    expect(stripped).toContain('data:image/png;base64,AAAA');
  });

  it('renders Appearance sub-sheet with Light, Dark, System theme previews, Colours, and Images', () => {
    const html = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="appearance" />,
    );
    expect(html).toContain('Appearance');
    expect(html).toContain('Theme');
    expect(html).toContain('Density');
    expect(html).toContain('Light');
    expect(html).toContain('Dark');
    expect(html).toContain('System');
    expect(html).toContain('Colours');
    expect(html).toContain('Images');
  });

  it('renders Sender Screening, Editor Language, and Sync Settings deep sub-sheets', () => {
    const screeningHtml = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="screening" />,
    );
    expect(screeningHtml).toContain('Sender Screening');
    expect(screeningHtml).toContain('Screen Unknown Senders');

    const editorHtml = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="editor_language" />,
    );
    expect(editorHtml).toContain('Editor Language');
    expect(editorHtml).toContain('Auto-Capitalisation');
    expect(editorHtml).toContain('Spell Check');

    const syncHtml = renderToStaticMarkup(
      <AccountsSettingsFlow {...baseProps} initialStep="sync_settings" />,
    );
    expect(syncHtml).toContain('Sync Settings');
    expect(syncHtml).toContain('Days of Email to Sync');
    expect(syncHtml).toContain('Download Attachments Automatically');
  });
});
