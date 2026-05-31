'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  Card,
  Button,
  Badge,
  Modal,
  Input,
  FormField,
  SearchInput,
  Skeleton,
} from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useRepos, useCreateRepo } from '../../hooks/useRepos';

export default function ReposPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRepo, setNewRepo] = useState({ name: '', description: '', visibility: 'private' });

  const { data: repos, isLoading, error, refetch } = useRepos();
  const createRepo = useCreateRepo();

  const filteredRepos =
    repos?.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];

  const handleCreate = useCallback(async () => {
    if (!newRepo.name) return;
    await createRepo.mutateAsync(newRepo);
    setShowCreateModal(false);
    setNewRepo({ name: '', description: '', visibility: 'private' });
  }, [newRepo, createRepo]);

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Repositories</h1>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            New Repo
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--quant-border)]">
          <SearchInput
            placeholder="Filter repositories..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Repo list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="80px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && filteredRepos.length === 0 && (
            <EmptyState
              title="No repositories"
              description="Create a new repository to get started"
            />
          )}
          {!isLoading &&
            !error &&
            filteredRepos.map((repo) => (
              <Card
                key={repo.id}
                padding="none"
                className="mb-3 p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors"
                onClick={() => router.push(`/repos/${repo.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm text-[var(--quant-primary)]">
                        {repo.name}
                      </h3>
                      <Badge variant={repo.visibility === 'public' ? 'success' : 'default'}>
                        {repo.visibility}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                      {repo.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--quant-muted-foreground)]">
                      {repo.language && <span>{repo.language}</span>}
                      <span>&#9733; {repo.stars}</span>
                      <span>Forks: {repo.forks}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
        </div>

        {/* Create Repo Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="New Repository"
        >
          <div className="space-y-4">
            <FormField label="Name" required>
              <Input
                value={newRepo.name}
                onChange={(e) => setNewRepo((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="my-project"
              />
            </FormField>
            <FormField label="Description">
              <Input
                value={newRepo.description}
                onChange={(e) => setNewRepo((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="A brief description"
              />
            </FormField>
            <FormField label="Visibility">
              <select
                className="w-full rounded-md border border-[var(--quant-border)] bg-transparent px-3 py-2 text-sm"
                value={newRepo.visibility}
                onChange={(e) => setNewRepo((prev) => ({ ...prev, visibility: e.target.value }))}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
              </select>
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
