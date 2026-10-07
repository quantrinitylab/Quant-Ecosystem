// ============================================================================
// quantai — code-agent api-client hook (Layer 5)
// ============================================================================
//
// Typed react-query hook over the same-origin Next proxy path
// `/api/agents/code/analyze` (never inline fetch — Requirement 1.4).
import { useApiMutation } from '@quant/api-client';
import type { CodeAnalyzeInput, RepoModel } from './types';

/** POST /api/agents/code/analyze — derive a repo model from a file listing. */
export function useAnalyzeCode() {
  return useApiMutation<CodeAnalyzeInput, RepoModel>('/api/agents/code/analyze');
}
