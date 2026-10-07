import { describe, it, expect } from 'vitest';
import { blocksToMarkdown, markdownToBlocks } from '../app/drive/doc/[docId]/markdown-serializer';
import { SLASH_COMMANDS } from '../app/drive/doc/[docId]/SlashMenu';
import type { EditorBlock } from '../app/drive/doc/[docId]/types';

describe('QuantDrive Block Editor & Markdown Serialization (Gate N-G2)', () => {
  it('has all required in-house slash commands defined in Gate N-G2', () => {
    const commandIds = SLASH_COMMANDS.map((c) => c.id);
    const requiredCommands = [
      'h1',
      'h2',
      'h3',
      'todo',
      'bullet',
      'numbered',
      'table',
      'code',
      'callout',
      'quote',
      'divider',
    ];

    for (const cmd of requiredCommands) {
      expect(commandIds).toContain(cmd);
    }
  });

  it('converts blocks to GitHub Flavored Markdown cleanly', () => {
    const testBlocks: EditorBlock[] = [
      { id: '1', type: 'h1', content: 'Architecture Memo' },
      { id: '2', type: 'paragraph', content: 'Notion parity achieved.' },
      { id: '3', type: 'todo', checked: true, content: 'Gate N-G1 canonical route' },
      { id: '4', type: 'todo', checked: false, content: 'Gate N-G2 slash menu' },
      { id: '5', type: 'code', language: 'typescript', content: 'const ydoc = new Y.Doc();' },
      { id: '6', type: 'quote', content: 'Zero commercial dependencies.' },
      { id: '7', type: 'callout', calloutIcon: '💡', content: 'Important note on CRDT.' },
      { id: '8', type: 'divider', content: '' },
      {
        id: '9',
        type: 'table',
        content: '',
        tableData: [
          ['Header 1', 'Header 2'],
          ['Cell A', 'Cell B'],
        ],
      },
    ];

    const md = blocksToMarkdown(testBlocks);

    expect(md).toContain('# Architecture Memo');
    expect(md).toContain('Notion parity achieved.');
    expect(md).toContain('- [x] Gate N-G1 canonical route');
    expect(md).toContain('- [ ] Gate N-G2 slash menu');
    expect(md).toContain('```typescript\nconst ydoc = new Y.Doc();\n```');
    expect(md).toContain('> Zero commercial dependencies.');
    expect(md).toContain('> 💡 Important note on CRDT.');
    expect(md).toContain('---');
    expect(md).toContain('| Header 1 | Header 2 |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Cell A | Cell B |');
  });

  it('parses GitHub Flavored Markdown back into structured EditorBlocks', () => {
    const rawMd = `# Title Heading

This is a paragraph.

## Subtitle

- [x] Done task
- [ ] Open task

- Bullet point

1. Numbered point

> 🚀 Rocket launch callout

> Regular blockquote

---

\`\`\`python
print("Hello Quant")
\`\`\`

| Col A | Col B |
| --- | --- |
| Val 1 | Val 2 |
`;

    const blocks = markdownToBlocks(rawMd);

    expect(blocks.some((b) => b.type === 'h1' && b.content === 'Title Heading')).toBe(true);
    expect(blocks.some((b) => b.type === 'paragraph' && b.content === 'This is a paragraph.')).toBe(
      true,
    );
    expect(blocks.some((b) => b.type === 'h2' && b.content === 'Subtitle')).toBe(true);
    expect(
      blocks.some((b) => b.type === 'todo' && b.checked === true && b.content === 'Done task'),
    ).toBe(true);
    expect(
      blocks.some((b) => b.type === 'todo' && b.checked === false && b.content === 'Open task'),
    ).toBe(true);
    expect(blocks.some((b) => b.type === 'bullet' && b.content === 'Bullet point')).toBe(true);
    expect(blocks.some((b) => b.type === 'numbered' && b.content === 'Numbered point')).toBe(true);
    expect(blocks.some((b) => b.type === 'callout' && b.calloutIcon === '🚀')).toBe(true);
    expect(blocks.some((b) => b.type === 'quote' && b.content === 'Regular blockquote')).toBe(true);
    expect(blocks.some((b) => b.type === 'divider')).toBe(true);
    expect(
      blocks.some(
        (b) => b.type === 'code' && b.language === 'python' && b.content === 'print("Hello Quant")',
      ),
    ).toBe(true);
    expect(blocks.some((b) => b.type === 'table' && b.tableData?.length === 2)).toBe(true);
  });

  it('handles empty markdown strings gracefully with a default paragraph', () => {
    const blocks = markdownToBlocks('');
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].content).toBe('');
  });
});
