'use client';

import { MailFolderPage } from '../../components/MailFolderPage';
import { apiClient } from '../../services/api-client';

export default function StarredPage() {
  return (
    <MailFolderPage
      folderType="STARRED"
      kicker="Pinned signal"
      title="Starred"
      subtitle="you starred to keep in reach"
      emptyTitle="No starred conversations yet"
      emptyDescription="Tap the star on any conversation and it will stay pinned here for quick access."
      rowAction={{
        label: 'Unstar',
        pendingLabel: 'Removing…',
        successToast: 'Removed from Starred',
        // Every row this list returned is starred, so flipping each one clears the
        // whole conversation rather than trading a star between its two copies.
        run: (id) => apiClient.toggleStar(id),
      }}
    />
  );
}
