import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRDiffViewer } from '../components/PRDiffViewer';
import { parseUnifiedDiff } from '../components/prDiffParser';
import type { PRDiffFile } from '../types';

// QM-FIX — the PR "Files changed" tab must render the REAL server-computed
// diff per file (parsed from GET /:id/pulls/:number/diff). These tests pin the
// renderer: real file blocks, real line content, honest binary/rename states,
// and the inline-comment affordance. Nothing here may contain invented copy.

const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
diff --git a/assets/logo.png b/assets/logo.png
index 7777777..8888888 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
diff --git a/src/was.ts b/src/is.ts
similarity index 92%
rename from src/was.ts
rename to src/is.ts
index 5555555..6666666 100644
--- a/src/was.ts
+++ b/src/is.ts
@@ -1 +1 @@
-old
+new
`;

const FILES: PRDiffFile[] = parseUnifiedDiff(DIFF);

function baseProps(overrides: Partial<React.ComponentProps<typeof PRDiffViewer>> = {}) {
  return {
    files: FILES,
    activeLineKey: null as string | null,
    lineCommentText: '',
    diffComments: {},
    onOpenLine: vi.fn(),
    onCancelLine: vi.fn(),
    onChangeCommentText: vi.fn(),
    onSubmitComment: vi.fn(),
    ...overrides,
  };
}

describe('PRDiffViewer', () => {
  it('renders one block per file with real filenames and status chips', () => {
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps()} />);
    expect(html).toContain('data-testid="diff-files"');
    expect((html.match(/data-testid="diff-file-block"/g) ?? []).length).toBe(3);
    expect(html).toContain('src/app.ts');
    expect(html).toContain('assets/logo.png');
    expect(html).toContain('src/is.ts');
    expect(html).toContain('Modified');
    expect(html).toContain('Renamed');
    expect(html).toContain('renamed from src/was.ts');
  });

  it('renders real hunk line content with old/new line numbers', () => {
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps()} />);
    expect(html).toContain('const x = 1;');
    expect(html).toContain('const y = 2;');
    expect(html).toContain('const y = 3;');
    expect(html).toContain('@@ -1,2 +1,3 @@');
    // line-number gutters carry the parsed numbers
    expect(html).toContain('data-testid="diff-line-0:0:1"');
    // per-line comment affordance exists on real lines
    expect(html).toContain('data-testid="diff-line-comment-btn-0:0:1"');
    expect(html).toContain('Add a review comment on src/app.ts line 2');
  });

  it('renders the honest binary notice instead of invented hunks', () => {
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps()} />);
    expect(html).toContain('Binary file — diff not shown.');
  });

  it('shows the comment box only for the active line key, with existing comments', () => {
    const lineId = 'src/app.ts-l2';
    const html = renderToStaticMarkup(
      <PRDiffViewer
        {...baseProps({
          activeLineKey: '0:0:1',
          lineCommentText: 'looks good',
          diffComments: {
            [lineId]: [
              {
                id: 'c-9',
                lineId,
                author: 'reviewer',
                body: 'nit: rename this',
                createdAt: 'Just now',
                side: 'LEFT',
              },
            ],
          },
        })}
      />,
    );
    expect(html).toContain('data-testid="diff-line-comment-box-0:0:1"');
    expect(html).toContain('data-testid="diff-line-comment-input"');
    expect(html).toContain('nit: rename this');
    expect(html).toContain('data-testid="diff-line-comment-c-9"');
    // removed line 2 and added line 2 share the backend line reference —
    // the box still opens on exactly one of them
    expect((html.match(/data-testid="diff-line-comment-box-/g) ?? []).length).toBe(1);
  });

  it('shows side-specific comments only on their own side of the line', () => {
    const lineId = 'src/app.ts-l2';
    const html = renderToStaticMarkup(
      <PRDiffViewer
        {...baseProps({
          diffComments: {
            [lineId]: [
              {
                id: 'c-left',
                lineId,
                author: 'reviewer',
                body: 'left-side note',
                createdAt: 'now',
                side: 'LEFT',
              },
              {
                id: 'c-right',
                lineId,
                author: 'reviewer',
                body: 'right-side note',
                createdAt: 'now',
                side: 'RIGHT',
              },
            ],
          },
        })}
      />,
    );
    // deletion line 0:0:1 (LEFT) shows only the left comment …
    const leftBlock = html.split('data-testid="diff-line-0:0:1"')[1].split('data-testid="diff-line-0:0:2"')[0];
    expect(leftBlock).toContain('left-side note');
    expect(leftBlock).not.toContain('right-side note');
    // … and addition line 0:0:2 (RIGHT) shows only the right comment
    const rightBlock = html.split('data-testid="diff-line-0:0:2"')[1];
    expect(rightBlock).toContain('right-side note');
    expect(rightBlock).not.toContain('left-side note');
  });

  it('renders no comment box when no line is active', () => {
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps()} />);
    expect(html).not.toContain('diff-line-comment-box-');
    expect(html).not.toContain('diff-line-comment-input');
  });

  it('escapes diff content — never raw HTML injection', () => {
    const evil: PRDiffFile[] = [
      {
        filename: 'x.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            header: '@@ -1 +1 @@',
            lines: [
              {
                id: '0:0:0',
                type: 'addition',
                newLineNumber: 1,
                content: '<script>alert(1)</script>',
              },
            ],
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps({ files: evil })} />);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never renders dead view-mode toggle copy', () => {
    const html = renderToStaticMarkup(<PRDiffViewer {...baseProps()} />);
    expect(html).not.toContain('Unified');
    expect(html).not.toContain('Split');
    expect(html).not.toContain('diff-mode-unified');
    expect(html).not.toContain('diff-mode-split');
  });
});
