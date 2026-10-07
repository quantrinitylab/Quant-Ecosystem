/** A partially completed upload batch must not resolve as an all-files success. */
export function getUploadBatchError(total: number, failures: readonly string[]): string | null {
  if (failures.length === 0) return null;
  const uploaded = total - failures.length;
  const reason = failures[0] || 'See the upload list for details.';
  return `Uploaded ${uploaded} of ${total} files. ${failures.length} failed or cancelled. ${reason}`;
}
