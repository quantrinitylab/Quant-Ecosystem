import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { PhotoDrawingStudio } from '../components/PhotoDrawingStudio';
import { DensitySelectorSheet } from '../components/DensitySelectorSheet';
import { MobileProfileIconCustomizerSheet } from '../components/MobileProfileIconCustomizerSheet';
import {
  MobileAutomaticRepliesSheet,
  MobileClearCalendarScheduleModal,
} from '../components/MobileAutomaticRepliesSheet';

describe('Extracted Reusable Mobile Sheets', () => {
  it('renders PhotoDrawingStudio with canvas and tool palette', () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    const html = renderToStaticMarkup(
      <PhotoDrawingStudio isOpen={true} onDone={onDone} onCancel={onCancel} />,
    );

    expect(html).toContain('data-testid="photo-drawing-studio"');
    expect(html).toContain('Photo Studio');
    expect(html).toContain('data-testid="drawing-finish-btn"');
    expect(html).toContain('data-testid="tool-ink-btn"');
  });

  it('renders DensitySelectorSheet in Compact & Cozy modes', () => {
    const htmlCompact = renderToStaticMarkup(
      <DensitySelectorSheet currentDensity="compact" />,
    );
    expect(htmlCompact).toContain('density-selector-sheet');
    expect(htmlCompact).toContain('Compact');

    const htmlCozy = renderToStaticMarkup(
      <DensitySelectorSheet currentDensity="cozy" />,
    );
    expect(htmlCozy).toContain('density-selector-sheet');
    expect(htmlCozy).toContain('Cozy');
  });

  it('renders ProfileIconCustomizerSheet with Initials and Customise options', () => {
    const html = renderToStaticMarkup(
      <MobileProfileIconCustomizerSheet
        isOpen={true}
        onClose={() => {}}
        onSelectIcon={() => {}}
      />,
    );
    expect(html).toContain('profile-icon-customizer-sheet');
    expect(html).toContain('Show As');
    expect(html).toContain('Account Initials');
    expect(html).toContain('Customise');
  });

  it('renders AutomaticRepliesSheet and ClearCalendarScheduleModal', () => {
    const autoRepliesHtml = renderToStaticMarkup(
      <MobileAutomaticRepliesSheet
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(autoRepliesHtml).toContain('automatic-replies-sheet');
    expect(autoRepliesHtml).toContain('Automatic Replies');
    expect(autoRepliesHtml).toContain('Clear My Calendar');

    const clearScheduleHtml = renderToStaticMarkup(
      <MobileClearCalendarScheduleModal
        onClose={() => {}}
        onDeclineSelected={() => {}}
      />,
    );
    expect(clearScheduleHtml).toContain('clear-calendar-schedule-sheet');
    expect(clearScheduleHtml).toContain('Clear My Calendar');
    expect(clearScheduleHtml).toContain('Lunch');
  });
});
