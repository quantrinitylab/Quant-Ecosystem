// QM-UIUX-028: never invent a commit SHA in user-facing copy. Shows the short SHA
// only when the backend actually returned one; otherwise no SHA is claimed.
export function formatCommitToast(path: string, commitSha: unknown): string {
  const sha = typeof commitSha === 'string' && commitSha ? commitSha.slice(0, 8) : null;
  return sha ? `Committed ${path} at ${sha}` : `Committed ${path}`;
}
