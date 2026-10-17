import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../components/prDiffParser';

// QM-FIX — the PR "Files changed" tab must render the REAL server-computed
// diff (GET /:id/pulls/:number/diff), parsed here. These tests pin the
// parser against real `git diff -p` shapes: never invented file contents.

const MULTI_FILE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 import { a } from './a';
+import { b } from './b';
 const x = 1;
-const y = 2;
+const y = 3;
 export { x, y };
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export const fresh = true;
+export const answer = 42;
+
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = 1;
-export const gone2 = 2;
`;

const RENAME_DIFF = `diff --git a/src/was.ts b/src/is.ts
similarity index 92%
rename from src/was.ts
rename to src/is.ts
index 5555555..6666666 100644
--- a/src/was.ts
+++ b/src/is.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 20;
 const c = 3;
`;

const BINARY_DIFF = `diff --git a/assets/logo.png b/assets/logo.png
index 7777777..8888888 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

const NO_NEWLINE_DIFF = `diff --git a/a.txt b/a.txt
index 9999999..aaaaaaa 100644
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-hello
\\ No newline at end of file
+hello world
\\ No newline at end of file
`;

describe('parseUnifiedDiff', () => {
  it('returns [] for empty / non-diff input (honest unavailable state)', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('   \n  ')).toEqual([]);
    expect(parseUnifiedDiff('not a diff at all')).toEqual([]);
    expect(parseUnifiedDiff(null as unknown as string)).toEqual([]);
  });

  it('parses modified + added + deleted files with correct statuses', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF);
    expect(files).toHaveLength(3);

    const modified = files[0];
    expect(modified.filename).toBe('src/app.ts');
    expect(modified.status).toBe('modified');
    expect(modified.additions).toBe(2);
    expect(modified.deletions).toBe(1);
    expect(modified.hunks).toHaveLength(1);
    expect(modified.hunks[0].header).toBe('@@ -1,4 +1,5 @@');

    const added = files[1];
    expect(added.filename).toBe('src/new.ts');
    expect(added.status).toBe('added');
    expect(added.additions).toBe(3); // includes the trailing empty-line addition
    expect(added.deletions).toBe(0);

    const deleted = files[2];
    expect(deleted.filename).toBe('src/old.ts');
    expect(deleted.status).toBe('deleted');
    expect(deleted.additions).toBe(0);
    expect(deleted.deletions).toBe(2);
  });

  it('tracks old/new line numbers across a hunk', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF);
    const lines = files[0].hunks[0].lines;
    // context
    expect(lines[0]).toMatchObject({ type: 'context', oldLineNumber: 1, newLineNumber: 1 });
    // addition
    expect(lines[1]).toMatchObject({ type: 'addition', newLineNumber: 2 });
    expect(lines[1].oldLineNumber).toBeUndefined();
    expect(lines[1].content).toBe("import { b } from './b';");
    // context after the addition keeps both counters in step
    expect(lines[2]).toMatchObject({ type: 'context', oldLineNumber: 2, newLineNumber: 3 });
    // deletion
    expect(lines[3]).toMatchObject({ type: 'deletion', oldLineNumber: 3 });
    expect(lines[3].newLineNumber).toBeUndefined();
    // addition following the deletion
    expect(lines[4]).toMatchObject({ type: 'addition', newLineNumber: 4 });
    expect(lines[5]).toMatchObject({ type: 'context', oldLineNumber: 4, newLineNumber: 5 });
    // line ids are unique
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records renames with the old filename', () => {
    const files = parseUnifiedDiff(RENAME_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('src/is.ts');
    expect(files[0].oldFilename).toBe('src/was.ts');
    expect(files[0].status).toBe('modified');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
  });

  it('marks binary diffs as binary with no invented text hunks', () => {
    const files = parseUnifiedDiff(BINARY_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('assets/logo.png');
    expect(files[0].binary).toBe(true);
    expect(files[0].hunks).toEqual([]);
    expect(files[0].additions).toBe(0);
    expect(files[0].deletions).toBe(0);
  });

  it('skips the "No newline at end of file" marker instead of rendering it', () => {
    const files = parseUnifiedDiff(NO_NEWLINE_DIFF);
    expect(files).toHaveLength(1);
    const lines = files[0].hunks[0].lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ type: 'deletion', content: 'hello' });
    expect(lines[1]).toMatchObject({ type: 'addition', content: 'hello world' });
  });

  it('strips a/ b/ prefixes but keeps genuinely prefixed filenames intact', () => {
    const diff = `diff --git a/a/b.ts b/a/b.ts
index 1111111..2222222 100644
--- a/a/b.ts
+++ b/a/b.ts
@@ -1 +1 @@
-x
+x
`;
    const files = parseUnifiedDiff(diff);
    expect(files[0].filename).toBe('a/b.ts');
  });

  it('drops malformed hunks without inventing lines', () => {
    const diff = `diff --git a/x.ts b/x.ts
index 1111111..2222222 100644
--- a/x.ts
+++ b/x.ts
@@ not a hunk header
+this line has no valid hunk
@@ -1 +1 @@
-ok
+ok2
`;
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    const lines = files[0].hunks[0].lines;
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.content !== 'this line has no valid hunk')).toBe(true);
  });
});
