'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, Card, Badge, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { CodeEditor } from '../../../components/CodeEditor';
import {
  useRepo,
  useBranches,
  useCommits,
  usePullRequests,
  useIssues,
  useFileTree,
  useFileContent,
} from '../../../hooks/useRepos';

type Tab = 'code' | 'prs' | 'issues' | 'branches' | 'commits';

export default function RepoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = (params?.id as string) || '';
  const [activeTab, setActiveTab] = useState<Tab>('code');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: repo, isLoading: loadingRepo, error: repoError } = useRepo(repoId);
  const { data: fileTree, isLoading: loadingTree } = useFileTree(repoId);
  const {
    data: fileContent,
    isLoading: loadingContent,
    error: contentError,
    refetch: refetchContent,
  } = useFileContent(repoId, selectedFile);
  const { data: branches, isLoading: loadingBranches } = useBranches(repoId);
  const { data: commits, isLoading: loadingCommits } = useCommits(repoId);
  const { data: prs, isLoading: loadingPRs } = usePullRequests(repoId);
  const { data: issues, isLoading: loadingIssues } = useIssues(repoId);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'code', label: 'Code' },
    { key: 'prs', label: 'Pull Requests' },
    { key: 'issues', label: 'Issues' },
    { key: 'branches', label: 'Branches' },
    { key: 'commits', label: 'Commits' },
  ];

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--quant-border)]">
          <Button variant="secondary" onClick={() => router.push('/repos')}>
            Back
          </Button>
          {repo && (
            <div>
              <h1 className="text-lg font-semibold">{repo.name}</h1>
              <p className="text-xs text-[var(--quant-muted-foreground)]">{repo.description}</p>
            </div>
          )}
        </div>

        {/* Tabs — GitHub-style underline */}
        <nav className="flex items-center gap-1 px-4 border-b border-[var(--quant-border)] overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`relative px-3 py-2.5 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-[var(--quant-foreground)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-primary)] after:rounded-t'
                  : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loadingRepo && <Skeleton variant="rect" width="100%" height="200px" />}
          {repoError && <ErrorState message={repoError.message} />}

          {/* Code tab */}
          {activeTab === 'code' && (
            <div className="flex flex-col md:flex-row gap-4 md:h-full">
              {/* File tree */}
              <div className="md:w-72 md:flex-shrink-0 md:overflow-y-auto md:border-r md:border-[var(--quant-border)] md:pr-2">
                {loadingTree && <Skeleton variant="rect" width="100%" height="300px" />}
                {!loadingTree && (!fileTree || fileTree.length === 0) && (
                  <EmptyState title="No files" description="This repository is empty" />
                )}
                {!loadingTree && fileTree && fileTree.length > 0 && (
                  <div className="space-y-1">
                    {fileTree.map((path) => {
                      const isFolder = path.endsWith('/');
                      const isActive = selectedFile === path;
                      return (
                        <button
                          key={path}
                          type="button"
                          disabled={isFolder}
                          onClick={() => !isFolder && setSelectedFile(path)}
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-[var(--quant-primary)] text-white'
                              : 'hover:bg-[var(--quant-muted)]'
                          } ${isFolder ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                        >
                          <span className={isActive ? '' : 'text-[var(--quant-muted-foreground)]'}>
                            {isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
                          </span>
                          <span className="truncate">{path}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* File viewer */}
              <div className="flex-1 min-w-0 md:overflow-auto">
                {!selectedFile && (
                  <EmptyState
                    title="Select a file"
                    description="Choose a file from the tree to view its contents"
                  />
                )}
                {selectedFile && loadingContent && (
                  <Skeleton variant="rect" width="100%" height="300px" />
                )}
                {selectedFile && contentError && (
                  <ErrorState
                    message={contentError.message}
                    onRetry={() => void refetchContent()}
                  />
                )}
                {selectedFile && !loadingContent && !contentError && fileContent && (
                  <CodeEditor filename={selectedFile} content={fileContent.content} />
                )}
              </div>
            </div>
          )}

          {/* Pull Requests tab */}
          {activeTab === 'prs' && (
            <>
              {loadingPRs && <Skeleton variant="rect" width="100%" height="200px" />}
              {!loadingPRs && (!prs || prs.length === 0) && (
                <EmptyState
                  title="No pull requests"
                  description="No PRs found for this repository"
                />
              )}
              {!loadingPRs &&
                prs &&
                prs.map((pr) => (
                  <Card key={pr.id} className="mb-2 p-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          pr.status === 'open'
                            ? 'success'
                            : pr.status === 'merged'
                              ? 'info'
                              : 'default'
                        }
                      >
                        {pr.status}
                      </Badge>
                      <span className="font-medium text-sm">{pr.title}</span>
                      <span className="text-xs text-[var(--quant-muted-foreground)] ml-auto">
                        #{pr.number}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                      {pr.sourceBranch} → {pr.targetBranch} by{' '}
                      {pr.author?.name || pr.author?.username}
                    </p>
                  </Card>
                ))}
            </>
          )}

          {/* Issues tab */}
          {activeTab === 'issues' && (
            <>
              {loadingIssues && <Skeleton variant="rect" width="100%" height="200px" />}
              {!loadingIssues && (!issues || issues.length === 0) && (
                <EmptyState title="No issues" description="No issues found" />
              )}
              {!loadingIssues &&
                issues &&
                issues.map((issue) => (
                  <Card key={issue.id} className="mb-2 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={issue.status === 'open' ? 'warning' : 'default'}>
                        {issue.status}
                      </Badge>
                      <span className="font-medium text-sm">{issue.title}</span>
                      <span className="text-xs text-[var(--quant-muted-foreground)] ml-auto">
                        #{issue.number}
                      </span>
                    </div>
                  </Card>
                ))}
            </>
          )}

          {/* Branches tab */}
          {activeTab === 'branches' && (
            <>
              {loadingBranches && <Skeleton variant="rect" width="100%" height="200px" />}
              {!loadingBranches && (!branches || branches.length === 0) && (
                <EmptyState title="No branches" description="No branches found" />
              )}
              {!loadingBranches &&
                branches &&
                branches.map((branch) => (
                  <Card key={branch.name} className="mb-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{branch.name}</span>
                      {branch.isProtected && <Badge variant="warning">Protected</Badge>}
                    </div>
                  </Card>
                ))}
            </>
          )}

          {/* Commits tab */}
          {activeTab === 'commits' && (
            <>
              {loadingCommits && <Skeleton variant="rect" width="100%" height="200px" />}
              {!loadingCommits && (!commits || commits.length === 0) && (
                <EmptyState title="No commits" description="No commits found" />
              )}
              {!loadingCommits &&
                commits &&
                commits.map((commit) => (
                  <Card key={commit.sha} className="mb-2 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{commit.message}</p>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                          {commit.author?.name} - {new Date(commit.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-[var(--quant-muted-foreground)]">
                        {commit.sha?.slice(0, 7)}
                      </span>
                    </div>
                  </Card>
                ))}
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
