'use client';

import { MailFolderPage } from '../../components/MailFolderPage';
import { apiClient } from '../../services/api-client';

export default function ArchivePage() {
  return (
    <MailFolderPage
      folderType="ARCHIVE"
      kicker="Quiet storage"
      title="Archive"
      subtitle="archived out of your inbox"
      emptyTitle="Nothing archived yet"
      emptyDescription="Swipe a conversation or use the archive action and it will rest here — out of the inbox, never lost."
      rowAction={{
        label: 'Move to inbox',
        pendingLabel: 'Moving…',
        successToast: 'Moved back to inbox',
        run: (email) => apiClient.unarchiveEmail(email.id),
      }}
    />
  );
}
