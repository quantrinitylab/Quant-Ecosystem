'use client';

import { MailFolderPage } from '../../components/MailFolderPage';
import { apiClient } from '../../services/api-client';

export default function SpamPage() {
  return (
    <MailFolderPage
      folderType="SPAM"
      kicker="Kept at bay"
      title="Spam"
      subtitle="flagged as junk"
      emptyTitle="Spam is empty"
      emptyDescription="Suspicious mail lands here automatically so your inbox stays clean. Anything wrongly flagged can be rescued with one tap."
      rowAction={{
        label: 'Not spam',
        pendingLabel: 'Rescuing…',
        successToast: 'Moved to inbox',
        run: (email) => apiClient.markNotSpam(email.id),
      }}
    />
  );
}
