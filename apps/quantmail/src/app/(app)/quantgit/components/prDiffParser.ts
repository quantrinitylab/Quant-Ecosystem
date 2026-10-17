import type { PRDiffFile, PRDiffLine } from '../types';

// Parses the unified diff text produced by the backend
// (GET /api/repos/:id/pulls/:number/diff — `git diff -p base..head`) into
// the per-file/hunk model declared in ../types. Pure function: no network,
// no DOM, fully unit-testable. Anything it cannot parse is dropped — the
// caller renders the honest "not available" state, never invented content.

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
// Binary files a/logo.png and b/logo.png differ  (paths may be git-quoted)
const BINARY_FILES_RE =
  /^Binary files\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))\s+and\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))\s+differ$/;
// diff --git a/path b/path  (paths may be git-quoted when they hold spaces)
const DIFF_GIT_HEADER_RE =
  /^(?:"((?:[^"\\]|\\.)*)"|(\S+))\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))\s*$/;

/** Undo git's C-style quoting inside "..." path literals (best-effort). */
function unescapeQuotedPath(p: string): string {
  return p
    .replace(/\\([\\"])/g, '$1')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n');
}

/**
 * Normalize a raw ---/+++ path: unquote, keep the /dev/null sentinel,
 * strip the conventional a/ b/ prefixes.
 */
function normalizeDiffPath(raw: string): string {
  let p = raw.trim();
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    p = unescapeQuotedPath(p.slice(1, -1));
  }
  if (p === '/dev/null') return p;
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

function normalizeRenamePath(raw: string): string {
  let p = raw.trim();
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    p = unescapeQuotedPath(p.slice(1, -1));
  }
  return p;
}

type FileMeta = {
  oldPath: string | null;
  newPath: string | null;
  renameFrom: string | null;
  renameTo: string | null;
  binary: boolean;
  hunks: { header: string; lines: PRDiffLine[] }[];
  additions: number;
  deletions: number;
};

function parseChunk(chunk: string, fileIndex: number): PRDiffFile | null {
  const lines = chunk.split('\n');
  const headerLine = lines[0] ?? '';

  const meta: FileMeta = {
    oldPath: null,
    newPath: null,
    renameFrom: null,
    renameTo: null,
    binary: false,
    hunks: [],
    additions: 0,
    deletions: 0,
  };

  // Fallback filename from the `diff --git a/x b/y` header itself.
  let headerOld: string | null = null;
  let headerNew: string | null = null;
  const hm = DIFF_GIT_HEADER_RE.exec(headerLine.trim());
  if (hm) {
    const rawOld = hm[1] !== undefined ? unescapeQuotedPath(hm[1]) : hm[2];
    const rawNew = hm[3] !== undefined ? unescapeQuotedPath(hm[3]) : hm[4];
    headerOld = normalizeDiffPath(rawOld);
    headerNew = normalizeDiffPath(rawNew);
  }

  let currentHunk: { header: string; lines: PRDiffLine[] } | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of lines.slice(1)) {
    // --- / +++ / rename / Binary markers always precede the first hunk.
    if (!currentHunk) {
      if (rawLine.startsWith('--- ')) {
        meta.oldPath = normalizeDiffPath(rawLine.slice(4));
        continue;
      }
      if (rawLine.startsWith('+++ ')) {
        meta.newPath = normalizeDiffPath(rawLine.slice(4));
        continue;
      }
      if (rawLine.startsWith('rename from ')) {
        meta.renameFrom = normalizeRenamePath(rawLine.slice('rename from '.length));
        continue;
      }
      if (rawLine.startsWith('rename to ')) {
        meta.renameTo = normalizeRenamePath(rawLine.slice('rename to '.length));
        continue;
      }
      const bin = BINARY_FILES_RE.exec(rawLine);
      if (bin) {
        meta.binary = true;
        const rawOld = bin[1] !== undefined ? unescapeQuotedPath(bin[1]) : bin[2];
        const rawNew = bin[3] !== undefined ? unescapeQuotedPath(bin[3]) : bin[4];
        meta.oldPath = normalizeDiffPath(rawOld);
        meta.newPath = normalizeDiffPath(rawNew);
        continue;
      }
      if (rawLine === 'GIT binary patch') {
        meta.binary = true;
        continue;
      }
    }

    if (rawLine.startsWith('@@')) {
      const m = HUNK_HEADER_RE.exec(rawLine);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[3], 10);
        currentHunk = { header: rawLine, lines: [] };
        meta.hunks.push(currentHunk);
      } else {
        // Malformed hunk header — drop lines until the next valid hunk.
        currentHunk = null;
      }
      continue;
    }
    if (!currentHunk) continue;

    if (rawLine === '\\ No newline at end of file') continue;
    const marker = rawLine.charAt(0);
    if (marker !== ' ' && marker !== '+' && marker !== '-') continue;

    const content = rawLine.slice(1);
    const type: PRDiffLine['type'] =
      marker === '+' ? 'addition' : marker === '-' ? 'deletion' : 'context';
    const line: PRDiffLine = {
      id: `${fileIndex}:${meta.hunks.length - 1}:${currentHunk.lines.length}`,
      type,
      content,
    };
    if (type === 'addition') {
      line.newLineNumber = newLine++;
      meta.additions++;
    } else if (type === 'deletion') {
      line.oldLineNumber = oldLine++;
      meta.deletions++;
    } else {
      line.oldLineNumber = oldLine++;
      line.newLineNumber = newLine++;
    }
    currentHunk.lines.push(line);
  }

  // Resolve the display filename: --- / +++ win, header is the fallback.
  // For deleted files the new path is /dev/null — fall back to the old path.
  const oldP = meta.oldPath ?? headerOld;
  const newP = meta.newPath ?? headerNew;
  const oldIsNull = oldP === '/dev/null';
  const newIsNull = newP === '/dev/null';
  const filename = newIsNull ? oldP : newP;
  if (!filename || filename === '/dev/null') return null;

  const status: PRDiffFile['status'] = oldIsNull
    ? 'added'
    : newIsNull
      ? 'deleted'
      : 'modified';

  const file: PRDiffFile = {
    filename,
    status,
    additions: meta.additions,
    deletions: meta.deletions,
    hunks: meta.hunks,
  };
  if (meta.binary) file.binary = true;
  if (meta.renameFrom && meta.renameTo && meta.renameFrom !== meta.renameTo) {
    file.oldFilename = meta.renameFrom;
  }
  return file;
}

/**
 * Parse `git diff -p` output into per-file hunks. Returns [] for empty or
 * unparseable input — the caller treats that as "diff not available".
 */
export function parseUnifiedDiff(diffText: string): PRDiffFile[] {
  if (!diffText || typeof diffText !== 'string') return [];
  if (!diffText.includes('diff --git ')) return [];
  const chunks = diffText.split(/^diff --git /m).slice(1);
  const files: PRDiffFile[] = [];
  chunks.forEach((chunk, i) => {
    const file = parseChunk(chunk, i);
    if (file) files.push(file);
  });
  return files;
}
