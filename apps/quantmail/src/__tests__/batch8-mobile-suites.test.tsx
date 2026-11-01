import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  MobileFilesHubView,
  MobileAddStorageAccountSheet,
  MobileSearchAndFilterSuite,
  MobileHelpAndFeedbackSheet,
  MobileGivingFeedbackSheet,
  MobileInviteGuestsSheet,
  MobileJoinMeetingCard,
  MobileWelcomeLoginView,
  MobileQrScannerSheet,
  MobileRemoveAccountAlert,
  MobilePhotoDrawingStudio,
  MobileAttachmentActionSheet,
  MobileNotificationsFeedSheet,
} from '../components/MobileBatch8Suite';

describe('Batch 8 Mobile Reverse-Engineered Suites', () => {
  // Flow #46: Files Hub
  it('renders MobileFilesHubView with file items and add button', () => {
    const onBack = vi.fn();
    const html = renderToStaticMarkup(<MobileFilesHubView onBack={onBack} />);

    expect(html).toContain('Files');
    expect(html).toContain('QI Performance Report.pdf');
    expect(html).toContain('Product Roadmap 2026.pdf');
    expect(html).toContain('data-testid="add-storage-btn"');
    expect(html).toContain('data-testid="mobile-files-hub-view"');
  });

  // Flow #56: Add Storage Account Sheet
  it('renders MobileAddStorageAccountSheet with QuantDrive and cloud providers', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(
      <MobileAddStorageAccountSheet
        isOpen={true}
        onClose={onClose}
        onSelectProvider={onSelect}
      />
    );

    expect(html).toContain('Add Storage Account');
    expect(html).toContain('QuantDrive');
    expect(html).toContain('Dropbox');
    expect(html).toContain('Google Drive');
    expect(html).toContain('Box');
  });

  // Flow #50 & #51: Search and Filter Suite
  it('renders MobileSearchAndFilterSuite with search input and tabs', () => {
    const onBack = vi.fn();
    const html = renderToStaticMarkup(<MobileSearchAndFilterSuite onBack={onBack} />);

    expect(html).toContain('placeholder="Search"');
    expect(html).toContain('data-testid="search-tab-all"');
    expect(html).toContain('data-testid="search-tab-email"');
    expect(html).toContain('data-testid="search-tab-people"');
    expect(html).toContain('data-testid="search-tab-files"');
    expect(html).toContain('data-testid="search-filter-sheet-trigger-btn"');
    expect(html).toContain('Follow-Up on Work');
  });

  // Flow #53: Help and Feedback Sheet
  it('renders MobileHelpAndFeedbackSheet with FAQ and diagnostics rows', () => {
    const onClose = vi.fn();
    const onOpenFeedback = vi.fn();
    const html = renderToStaticMarkup(
      <MobileHelpAndFeedbackSheet
        isOpen={true}
        onClose={onClose}
        onOpenGiveFeedback={onOpenFeedback}
      />
    );

    expect(html).toContain('Help &amp; Feedback');
    expect(html).toContain('Send Feedback');
    expect(html).toContain('FAQs');
    expect(html).toContain('Test Push Notifications');
    expect(html).toContain('Reset Spotlight Search Index');
  });

  // Flow #52: Giving Feedback Sheet
  it('renders MobileGivingFeedbackSheet with compliment, problem, suggestion categories', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(<MobileGivingFeedbackSheet isOpen={true} onClose={onClose} />);

    expect(html).toContain('Feedback to QuantMail');
    expect(html).toContain('Give a compliment');
    expect(html).toContain('Report a problem');
    expect(html).toContain('Make a suggestion');
  });

  // Flow #54: Inviting Guests
  it('renders MobileInviteGuestsSheet with required and optional attendee tiers', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const html = renderToStaticMarkup(
      <MobileInviteGuestsSheet
        isOpen={true}
        onClose={onClose}
        onSaveAttendees={onSave}
      />
    );

    expect(html).toContain('Attendees');
    expect(html).toContain('Required (1)');
    expect(html).toContain('Optional (1)');
    expect(html).toContain('Ms Alex Smith');
  });

  // Flow #55: Join Meeting Card & Open With Sheet
  it('renders MobileJoinMeetingCard with meeting title and Quanty Meet', () => {
    const html = renderToStaticMarkup(
      <MobileJoinMeetingCard
        meetingTitle="Project Fortuna: PRD Discussion"
        meetingId="934 897 545 405 7"
      />
    );

    expect(html).toContain('Project Fortuna: PRD Discussion');
    expect(html).toContain('Quanty Meet');
    expect(html).toContain('data-testid="join-meeting-btn"');
  });

  // Flow #58: Mobile Welcome & Login View
  it('renders MobileWelcomeLoginView with brand hero and domain chips', () => {
    const onLoginSuccess = vi.fn();
    const onOpenQr = vi.fn();
    const html = renderToStaticMarkup(
      <MobileWelcomeLoginView
        onLoginSuccess={onLoginSuccess}
        onOpenQrScanner={onOpenQr}
      />
    );

    expect(html).toContain('Welcome to QuantMail');
    expect(html).toContain('data-testid="welcome-add-account-btn"');
    expect(html).toContain('data-testid="welcome-scan-qr-btn"');
  });

  // Flow #57: QR Scanner Sheet
  it('renders MobileQrScannerSheet with camera viewfinder instructions', () => {
    const onClose = vi.fn();
    const onScanSuccess = vi.fn();
    const html = renderToStaticMarkup(
      <MobileQrScannerSheet
        isOpen={true}
        onClose={onClose}
        onScanSuccess={onScanSuccess}
      />
    );

    expect(html).toContain('QR Login');
    expect(html).toContain('Point your device&#x27;s camera at the QuantMail QR code on your computer.');
    expect(html).toContain('data-testid="qr-simulate-scan-btn"');
  });

  // Flow #59: Remove Account Alert
  it('renders MobileRemoveAccountAlert with account email warning', () => {
    const onCancel = vi.fn();
    const onConfirmRemove = vi.fn();
    const html = renderToStaticMarkup(
      <MobileRemoveAccountAlert
        isOpen={true}
        accountEmail="samlee.mobbin01@quantmail.com"
        onCancel={onCancel}
        onConfirmRemove={onConfirmRemove}
      />
    );

    expect(html).toContain('Remove account from this device?');
    expect(html).toContain('Removing this account will delete any local cached mail data.');
    expect(html).toContain('data-testid="confirm-remove-account-btn"');
  });

  // Flow #35: Photo Drawing Studio
  it('renders MobilePhotoDrawingStudio with canvas and tool palette', () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    const html = renderToStaticMarkup(<MobilePhotoDrawingStudio isOpen={true} onDone={onDone} onCancel={onCancel} />);

    expect(html).toContain('data-testid="photo-drawing-studio"');
    expect(html).toContain('Photo Studio');
    expect(html).toContain('data-testid="drawing-finish-btn"');
    expect(html).toContain('data-testid="tool-ink-btn"');
  });

  // Flow #63: Attachment Action Sheet
  it('renders MobileAttachmentActionSheet with Move to Body and Remove', () => {
    const onMoveToBody = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <MobileAttachmentActionSheet
        isOpen={true}
        fileName="Real_Estate_Photo.jpg"
        onMoveToBody={onMoveToBody}
        onRemove={onRemove}
        onClose={onClose}
      />
    );

    expect(html).toContain('Move to Message Body');
    expect(html).toContain('Remove Attachment');
    expect(html).toContain('data-testid="attachment-action-sheet"');
  });

  // Flow #65: Notifications Feed Sheet
  it('renders MobileNotificationsFeedSheet with notifications header', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(<MobileNotificationsFeedSheet isOpen={true} onClose={onClose} />);

    expect(html).toContain('Notifications');
    expect(html).toContain('data-testid="mobile-notifications-feed-sheet"');
  });
});
