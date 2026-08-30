'use client';

import { MailFolderPage } from '../../components/MailFolderPage';
import { apiClient } from '../../services/api-client';

export default function SnoozedPage() {
  return (
    <MailFolderPage
      folderType="SNOOZED"
      kicker="On the clock"
      title="Snoozed"
      subtitle="waiting for their wake time"
      emptyTitle="Nothing snoozed right now"
      emptyDescription="Snooze a conversation and it will hide from the inbox until its wake time — you will find it here in the meantime."
      rowAction={{
        label: 'Wake now',
        pendingLabel: 'Waking…',
        successToast: 'Back in your inbox',
        run: (id) => apiClient.unsnoozeEmail(id),
      }}
    />
  );
}
