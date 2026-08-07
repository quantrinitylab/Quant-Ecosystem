// ============================================================================
// QuantMail - useGit Hook
// Git operations: repos, branches, commits, PRs, reviews, merge, conflicts
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { logger } from '@quant/common';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';

interface Repository {
  id: string;
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  visibility: 'public' | 'private';
  defaultBranch: string;
  lastUpdated: string;
}

interface Branch {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
  lastCommitSha: string;
  lastCommitMessage: string;
  aheadBehind: { ahead: number; behind: number };
}

interface Commit {
  sha: string;
  message: string;
  author: { name: string; email: string; date: string };
  additions: number;
  deletions: number;
  filesChanged: number;
}

interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  author: { name: string; avatarUrl: string };
  status: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  reviewers: { name: string; status: string }[];
  hasConflicts: boolean;
  additions: number;
  deletions: number;
  createdAt: string;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

interface UseGitOptions {
  repoId?: string;
  branch?: string;
}

interface UseGitReturn {
  repos: Repository[];
  branches: Branch[];
  commits: Commit[];
  pullRequests: PullRequest[];
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  currentBranch: string;
  fetchRepos: () => Promise<void>;
  fetchBranches: (repoId: string) => Promise<void>;
  fetchCommits: (repoId: string, branch: string) => Promise<void>;
  fetchFiles: (repoId: string, branch: string, path: string) => Promise<void>;
  fetchPullRequests: (repoId: string, status?: string) => Promise<void>;
  createRepo: (data: {
    name: string;
    description: string;
    visibility: string;
  }) => Promise<Repository | null>;
  createBranch: (repoId: string, name: string, fromBranch: string) => Promise<boolean>;
  createPR: (
    repoId: string,
    data: { title: string; description: string; source: string; target: string },
  ) => Promise<PullRequest | null>;
  mergePR: (
    repoId: string,
    prId: string,
    strategy: string,
  ) => Promise<{ success: boolean; conflicts?: string[] }>;
  approvePR: (repoId: string, prId: string, comment?: string) => Promise<boolean>;
  requestChanges: (repoId: string, prId: string, comment: string) => Promise<boolean>;
  resolveConflict: (
    repoId: string,
    prId: string,
    filePath: string,
    resolution: string,
  ) => Promise<boolean>;
  forkRepo: (repoId: string) => Promise<Repository | null>;
  starRepo: (repoId: string) => Promise<void>;
  setCurrentBranch: (branch: string) => void;
}

export function useGit(options: UseGitOptions = {}): UseGitReturn {
  const { repoId, branch = 'main' } = options;
  const [repos, setRepos] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>(branch);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/api/repos');
      if (!response.ok) throw new Error('Failed to fetch repos');
      const data = await response.json();
      setRepos(data.repositories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBranches = useCallback(async (rid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/api/repos/${rid}/branches`);
      if (!response.ok) throw new Error('Failed to fetch branches');
      const data = await response.json();
      setBranches(data.branches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCommits = useCallback(async (rid: string, br: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/api/repos/${rid}/commits?branch=${br}&limit=50`);
      if (!response.ok) throw new Error('Failed to fetch commits');
      const data = await response.json();
      setCommits(data.commits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commits');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFiles = useCallback(async (rid: string, br: string, path: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branch: br, path });
      const response = await apiRequest(`/api/repos/${rid}/files?${params}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPullRequests = useCallback(async (rid: string, status: string = 'open') => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/api/repos/${rid}/prs?status=${status}`);
      if (!response.ok) throw new Error('Failed to fetch PRs');
      const data = await response.json();
      setPullRequests(data.pullRequests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PRs');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRepo = useCallback(
    async (data: {
      name: string;
      description: string;
      visibility: string;
    }): Promise<Repository | null> => {
      try {
        const response = await apiRequest('/api/repos', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Create repo failed');
        const repo = await response.json();
        setRepos((prev) => [repo, ...prev]);
        return repo;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed');
        return null;
      }
    },
    [],
  );

  const createBranch = useCallback(
    async (rid: string, name: string, fromBranch: string): Promise<boolean> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/branches`, {
          method: 'POST',
          body: JSON.stringify({ name, from: fromBranch }),
        });
        if (!response.ok) throw new Error('Create branch failed');
        const newBranch = await response.json();
        setBranches((prev) => [...prev, newBranch]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed');
        return false;
      }
    },
    [],
  );

  const createPR = useCallback(
    async (
      rid: string,
      data: { title: string; description: string; source: string; target: string },
    ): Promise<PullRequest | null> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/prs`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Create PR failed');
        const pr = await response.json();
        setPullRequests((prev) => [pr, ...prev]);
        return pr;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create PR failed');
        return null;
      }
    },
    [],
  );

  const mergePR = useCallback(
    async (
      rid: string,
      prId: string,
      strategy: string,
    ): Promise<{ success: boolean; conflicts?: string[] }> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/prs/${prId}/merge`, {
          method: 'POST',
          body: JSON.stringify({ strategy }),
        });
        const data = await response.json();
        if (!response.ok) return { success: false, conflicts: data.conflicts };
        setPullRequests((prev) =>
          prev.map((pr) => (pr.id === prId ? { ...pr, status: 'merged' as const } : pr)),
        );
        return { success: true };
      } catch (err) {
        return { success: false };
      }
    },
    [],
  );

  const approvePR = useCallback(
    async (rid: string, prId: string, comment?: string): Promise<boolean> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/prs/${prId}/review`, {
          method: 'POST',
          body: JSON.stringify({ action: 'approve', comment }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  const requestChanges = useCallback(
    async (rid: string, prId: string, comment: string): Promise<boolean> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/prs/${prId}/review`, {
          method: 'POST',
          body: JSON.stringify({ action: 'request_changes', comment }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  const resolveConflict = useCallback(
    async (rid: string, prId: string, filePath: string, resolution: string): Promise<boolean> => {
      try {
        const response = await apiRequest(`/api/repos/${rid}/prs/${prId}/conflicts/resolve`, {
          method: 'POST',
          body: JSON.stringify({ path: filePath, resolution }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  const forkRepo = useCallback(async (rid: string): Promise<Repository | null> => {
    try {
      const response = await apiRequest(`/api/repos/${rid}/fork`, { method: 'POST' });
      if (!response.ok) throw new Error('Fork failed');
      const forked = await response.json();
      setRepos((prev) => [forked, ...prev]);
      return forked;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
      return null;
    }
  }, []);

  const starRepo = useCallback(async (rid: string): Promise<void> => {
    try {
      await apiRequest(`/api/repos/${rid}/star`, { method: 'PUT' });
      setRepos((prev) => prev.map((r) => (r.id === rid ? { ...r, stars: r.stars + 1 } : r)));
    } catch (err) {
      logger.error('Star failed:', err);
    }
  }, []);

  useEffect(() => {
    if (repoId) {
      fetchBranches(repoId);
      fetchFiles(repoId, currentBranch, '');
    }
  }, [repoId, currentBranch]);

  return {
    repos,
    branches,
    commits,
    pullRequests,
    files,
    loading,
    error,
    currentBranch,
    fetchRepos,
    fetchBranches,
    fetchCommits,
    fetchFiles,
    fetchPullRequests,
    createRepo,
    createBranch,
    createPR,
    mergePR,
    approvePR,
    requestChanges,
    resolveConflict,
    forkRepo,
    starRepo,
    setCurrentBranch,
  };
}

export default useGit;
