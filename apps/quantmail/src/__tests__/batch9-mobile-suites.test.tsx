import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  MobileOnboardingWalkthroughView,
  MobilePlanDetailsSheet,
  MobileCalendarShareRemoveUserSheet,
  MobileReorderToolbarSheet,
  MobileReorderAppsSheet,
  MobileSaveToQuantDriveSheet,
  MobileCalendarDragDropSheet,
  MobileDoNotDisturbSheet,
  MobileSearchContactsSheet,
  MobileUniversalMailSearchSheet,
  MobileSearchSettingsSheet,
  MobileSendToQuantNoteSheet,
  MobilePasskeySetupSheet,
  MobileAccountDetailsSetupSheet,
  MobileMainSettingsHubView,
  MobileStorageBreakdownSheet,
  MobileSubscribeWorkspaceSheet,
  MobileDensitySelectorSheet,
  MobileTurnOffNotificationsSheet,
  MobileQuickDraftsBannerSheet,
  MobileOutOfOfficeTimeRangeSheet,
  MobileContactEmailTypeSheet,
  MobileContactPhotoUploadSheet,
  MobileComposerCameraSheet,
  MobileComposerGallerySheet,
  MobileAttachmentFilePreviewModal,
  MobileWidgetsPreviewSheet,
} from '../components/MobileBatch9Suite';

describe('Batch 9 Mobile Component Suite (Final 28 Flows)', () => {
  it('renders Flow #66: MobileOnboardingWalkthroughView', () => {
    const html = renderToStaticMarkup(<MobileOnboardingWalkthroughView />);
    expect(html).toContain('onboarding-walkthrough-view');
    expect(html).toContain('Welcome to QuantMail');
    expect(html).toContain('onboarding-step-welcome');
  });

  it('renders Flow #68: MobilePlanDetailsSheet', () => {
    const html = renderToStaticMarkup(<MobilePlanDetailsSheet />);
    expect(html).toContain('plan-details-sheet');
    expect(html).toContain('Quant Workspace Basic');
    expect(html).toContain('100 GB cloud storage');
  });

  it('renders Flow #71: MobileCalendarShareRemoveUserSheet', () => {
    const html = renderToStaticMarkup(<MobileCalendarShareRemoveUserSheet userEmail="alexsmith.mobbin@quantmail.com" />);
    expect(html).toContain('calendar-share-remove-user-sheet');
    expect(html).toContain('alexsmith.mobbin@quantmail.com');
    expect(html).toContain('Can View');
    expect(html).toContain('Can Edit');
  });

  it('renders Flow #72: MobileReorderToolbarSheet', () => {
    const html = renderToStaticMarkup(<MobileReorderToolbarSheet />);
    expect(html).toContain('reorder-toolbar-sheet');
    expect(html).toContain('Customize actions');
    expect(html).toContain('Attachment');
  });

  it('renders Flow #73: MobileReorderAppsSheet', () => {
    const html = renderToStaticMarkup(<MobileReorderAppsSheet />);
    expect(html).toContain('reorder-apps-sheet');
    expect(html).toContain('Reorder Apps');
    expect(html).toContain('Email');
    expect(html).toContain('Calendar');
  });

  it('renders Flow #76: MobileSaveToQuantDriveSheet', () => {
    const html = renderToStaticMarkup(<MobileSaveToQuantDriveSheet fileName="Q1 Performance Report.pdf" />);
    expect(html).toContain('save-to-quantdrive-sheet');
    expect(html).toContain('Save to QuantDrive');
    expect(html).toContain('Q1 Performance Report.pdf');
    expect(html).toContain('Documents');
  });

  it('renders Flow #78: MobileCalendarDragDropSheet', () => {
    const html = renderToStaticMarkup(<MobileCalendarDragDropSheet />);
    expect(html).toContain('calendar-drag-drop-sheet');
    expect(html).toContain('Daily standup');
    expect(html).toContain('Quanty Meet Meeting');
  });

  it('renders Flow #79: MobileDoNotDisturbSheet', () => {
    const html = renderToStaticMarkup(<MobileDoNotDisturbSheet />);
    expect(html).toContain('do-not-disturb-sheet');
    expect(html).toContain('Do Not Disturb');
    expect(html).toContain('For 1 hour');
  });

  it('renders Flow #81: MobileSearchContactsSheet', () => {
    const html = renderToStaticMarkup(<MobileSearchContactsSheet />);
    expect(html).toContain('search-contacts-sheet');
    expect(html).toContain('Search people');
    expect(html).toContain('Ms Alex Smith');
  });

  it('renders Flow #82: MobileUniversalMailSearchSheet', () => {
    const html = renderToStaticMarkup(<MobileUniversalMailSearchSheet />);
    expect(html).toContain('universal-mail-search-sheet');
    expect(html).toContain('Email, Events, Contacts, Files');
    expect(html).toContain('Follow-Up on Work');
  });

  it('renders Flow #83: MobileSearchSettingsSheet', () => {
    const html = renderToStaticMarkup(<MobileSearchSettingsSheet />);
    expect(html).toContain('search-settings-sheet');
    expect(html).toContain('Search Quick Settings');
    expect(html).toContain('Display &amp; Appearance');
  });

  it('renders Flow #84: MobileSendToQuantNoteSheet', () => {
    const html = renderToStaticMarkup(<MobileSendToQuantNoteSheet emailSubject="Follow-Up on Work" />);
    expect(html).toContain('send-to-quantnote-sheet');
    expect(html).toContain('Send to QuantNote');
    expect(html).toContain('Work Notes');
  });

  it('renders Flow #88: MobilePasskeySetupSheet', () => {
    const html = renderToStaticMarkup(<MobilePasskeySetupSheet />);
    expect(html).toContain('passkey-setup-sheet');
    expect(html).toContain('Setting up Passkey');
    expect(html).toContain('Sign in without passwords');
  });

  it('renders Flow #89: MobileAccountDetailsSetupSheet', () => {
    const html = renderToStaticMarkup(<MobileAccountDetailsSetupSheet />);
    expect(html).toContain('account-details-setup-sheet');
    expect(html).toContain('Account Profile');
    expect(html).toContain('Sam Lee');
  });

  it('renders Flow #90: MobileMainSettingsHubView', () => {
    const html = renderToStaticMarkup(<MobileMainSettingsHubView />);
    expect(html).toContain('main-settings-hub-view');
    expect(html).toContain('Settings');
    expect(html).toContain('Quick Settings');
  });

  it('renders Flow #93: MobileStorageBreakdownSheet', () => {
    const html = renderToStaticMarkup(<MobileStorageBreakdownSheet />);
    expect(html).toContain('storage-breakdown-sheet');
    expect(html).toContain('Storage');
    expect(html).toContain('4.8 GB of 15 GB Used');
  });

  it('renders Flow #94: MobileSubscribeWorkspaceSheet', () => {
    const html = renderToStaticMarkup(<MobileSubscribeWorkspaceSheet />);
    expect(html).toContain('subscribe-workspace-sheet');
    expect(html).toContain('Subscribe to Quant Workspace');
    expect(html).toContain('Quant Workspace Basic');
  });

  it('renders Flows #96 & #97: MobileDensitySelectorSheet in Compact & Cozy modes', () => {
    const htmlCompact = renderToStaticMarkup(<MobileDensitySelectorSheet currentDensity="compact" />);
    expect(htmlCompact).toContain('density-selector-sheet');
    expect(htmlCompact).toContain('Compact');

    const htmlCozy = renderToStaticMarkup(<MobileDensitySelectorSheet currentDensity="cozy" />);
    expect(htmlCozy).toContain('density-selector-sheet');
    expect(htmlCozy).toContain('Cozy');
  });

  it('renders Flow #99: MobileTurnOffNotificationsSheet', () => {
    const html = renderToStaticMarkup(<MobileTurnOffNotificationsSheet />);
    expect(html).toContain('turn-off-notifications-sheet');
    expect(html).toContain('Notifications &amp; Sounds');
    expect(html).toContain('Allow Notifications');
  });

  it('renders Flow #100: MobileQuickDraftsBannerSheet', () => {
    const html = renderToStaticMarkup(<MobileQuickDraftsBannerSheet />);
    expect(html).toContain('quick-drafts-banner-sheet');
    expect(html).toContain('Quick access to drafts');
  });

  it('renders Flow #101: MobileOutOfOfficeTimeRangeSheet', () => {
    const html = renderToStaticMarkup(<MobileOutOfOfficeTimeRangeSheet />);
    expect(html).toContain('out-of-office-time-range-sheet');
    expect(html).toContain('Reply Within a Time Range');
  });

  it('renders Flow #102: MobileContactEmailTypeSheet', () => {
    const html = renderToStaticMarkup(<MobileContactEmailTypeSheet currentType="Work" />);
    expect(html).toContain('contact-email-type-sheet');
    expect(html).toContain('Email type');
    expect(html).toContain('Work');
  });

  it('renders Flow #103: MobileContactPhotoUploadSheet', () => {
    const html = renderToStaticMarkup(<MobileContactPhotoUploadSheet />);
    expect(html).toContain('contact-photo-upload-sheet');
    expect(html).toContain('Contact photo');
    expect(html).toContain('Upload Photo');
  });

  it('renders Flow #105: MobileComposerCameraSheet', () => {
    const html = renderToStaticMarkup(<MobileComposerCameraSheet />);
    expect(html).toContain('composer-camera-sheet');
    expect(html).toContain('PHOTO');
  });

  it('renders Flow #108: MobileComposerGallerySheet', () => {
    const html = renderToStaticMarkup(<MobileComposerGallerySheet />);
    expect(html).toContain('composer-gallery-sheet');
    expect(html).toContain('Real Estate');
  });

  it('renders Flow #109: MobileAttachmentFilePreviewModal', () => {
    const html = renderToStaticMarkup(<MobileAttachmentFilePreviewModal fileName="Q1 Performance Report.pdf" />);
    expect(html).toContain('file-preview-modal');
    expect(html).toContain('Q1 Performance Report.pdf');
    expect(html).toContain('Save to QuantDrive');
  });

  it('renders Flow #110: MobileWidgetsPreviewSheet', () => {
    const html = renderToStaticMarkup(<MobileWidgetsPreviewSheet />);
    expect(html).toContain('widgets-preview-sheet');
    expect(html).toContain('Widgets Gallery');
  });
});
