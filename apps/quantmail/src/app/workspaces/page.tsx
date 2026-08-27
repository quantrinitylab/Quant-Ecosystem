'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  SearchInput,
  Skeleton,
} from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCreateWorkspace, useWorkspaces } from '../../hooks/useWorkspaces';
import { ROLE_COPY } from '../../types/workspace';

export default function WorkspacesPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();

  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const workspaces = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(q) ||
        workspace.slug.toLowerCase().includes(q) ||
        (workspace.description ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setFormError('Give your workspace a name.');
      return;
    }
    setFormError(null);
    try {
      const created = await createWorkspace.mutateAsync({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      router.push(`/workspaces/${created.id}`);
    } catch (mutationError) {
      setFormError(
        mutationError instanceof Error ? mutationError.message : 'Could not create the workspace.',
      );
    }
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page workspaces-workspace flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] p-4">
          <div>
            <h1 className="text-lg font-semibold">Workspaces</h1>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Invite people by email and work on one project together.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            New workspace
          </Button>
        </div>

        <div className="border-b border-[var(--quant-border)] p-4">
          <SearchInput placeholder="Search workspaces..." value={query} onChange={setQuery} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} variant="rect" width="100%" height="132px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && workspaces.length === 0 && (
            <EmptyState
              title={query ? 'No matching workspaces' : 'Start working together'}
              description={
                query
                  ? `Nothing matched “${query}”. Try a different name or clear the search.`
                  : 'Create a workspace, invite your team by email, and everyone lands on the same project with the right level of access.'
              }
              actionLabel={query ? 'Clear search' : 'Create workspace'}
              onAction={() => (query ? setQuery('') : setShowCreate(true))}
            />
          )}

          {!isLoading && !error && workspaces.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((workspace) => (
                <Card
                  key={workspace.id}
                  padding="none"
                  className="cursor-pointer p-4 transition-colors hover:bg-[var(--quant-muted)]"
                  onClick={() => router.push(`/workspaces/${workspace.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{workspace.name}</p>
                      <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                        /{workspace.slug}
                      </p>
                    </div>
                    <Badge variant={workspace.role === 'OWNER' ? 'primary' : 'default'}>
                      {ROLE_COPY[workspace.role].label}
                    </Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[32px] text-xs text-[var(--quant-muted-foreground)]">
                    {workspace.description || 'No description yet.'}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--quant-muted-foreground)]">
                    <span>
                      {workspace.memberCount} member{workspace.memberCount === 1 ? '' : 's'}
                    </span>
                    {workspace.pendingInviteCount > 0 && (
                      <span>{workspace.pendingInviteCount} pending invite</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Modal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          title="New workspace"
          description="A shared space for one project — mail, drive, calendar and CodeHub together."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={createWorkspace.isPending}
                onClick={() => void handleCreate()}
              >
                Create workspace
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <FormField label="Workspace name" required error={formError ?? undefined}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Quant Ecosystem"
                fullWidth
              />
            </FormField>
            <FormField label="Description" hint="Optional — what is this workspace for?">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Trading platform build-out"
                fullWidth
              />
            </FormField>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
