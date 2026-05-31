'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  Sidebar,
  Button,
  PageTransition,
  LoadingState,
  ErrorState,
} from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { DocList } from '../components/DocList';
import { useCreateDocument } from '../hooks/useDocuments';

const NAV_ITEMS: SidebarItem[] = [
  { id: 'all', label: 'All Docs' },
  { id: 'recent', label: 'Recent' },
  { id: 'shared', label: 'Shared with Me' },
  { id: 'templates', label: 'Templates' },
  { id: 'starred', label: 'Starred' },
  { id: 'trash', label: 'Trash' },
];

export default function DocsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const router = useRouter();
  const createDoc = useCreateDocument();

  const handleNewDocument = () => {
    createDoc.mutate(
      { title: 'Untitled Document' },
      {
        onSuccess: (data: { id: string }) => {
          router.push(`/doc/${data.id}`);
        },
      },
    );
  };

  const sidebarItems = NAV_ITEMS.map((item) => ({
    ...item,
    active: item.id === activeFilter,
    onClick: () => setActiveFilter(item.id),
  }));

  if (createDoc.isPending) {
    return <LoadingState text="Creating document..." />;
  }

  if (createDoc.isError) {
    return <ErrorState message="Failed to create document" onRetry={() => createDoc.reset()} />;
  }

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={sidebarItems}
          header={
            <div className="space-y-3">
              <h1 className="text-lg font-bold">QuantDocs</h1>
              <Button
                variant="primary"
                size="sm"
                onClick={handleNewDocument}
                disabled={createDoc.isPending}
                className="min-h-[44px] w-full focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                New Document
              </Button>
            </div>
          }
          aria-label="Document navigation"
        />
      }
      aria-label="QuantDocs application"
    >
      <PageTransition>
        <DocList filter={activeFilter} />
      </PageTransition>
    </AppShell>
  );
}
